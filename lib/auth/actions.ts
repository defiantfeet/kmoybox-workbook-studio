'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo, supabase } from '../session';
import { accountAdmin, authClient } from './credentials';
import { authOrigin, clearRecovery, recoveryAllowed, recoveryConfigured } from './recovery';

const value = (form: FormData, key: string) => String(form.get(key) ?? '');
const error = (message: string): ActionState => ({ message, error: true });
const emailSchema = z.email().max(254);
const sendMessage = 'If an account exists for that address, you’ll receive a password reset email.';
const passwordRule = 'Use at least 12 characters and no more than 72 bytes.';

function validPassword(password: string) {
  return [...password].length >= 12 && Buffer.byteLength(password, 'utf8') <= 72;
}

export async function authenticate(_: ActionState, form: FormData): Promise<ActionState> {
  const client = await supabase(true);
  if (!client || demo) return error('Supabase sign-in is unavailable.');
  const email = value(form, 'email').trim();
  const password = value(form, 'password');
  if (!emailSchema.safeParse(email).success || !password || Buffer.byteLength(password) > 1024) return error('Enter a valid email address and password.');
  await clearRecovery();
  if (value(form, 'mode') === 'signup') {
    if (!validPassword(password)) return error(passwordRule);
    const displayName = value(form, 'name').trim();
    if (displayName.length > 80) return error('Use a display name up to 80 characters.');
    const result = await client.auth.signUp({
      email, password,
      options: { data: { display_name: displayName }, emailRedirectTo: new URL('/auth/confirm', authOrigin()).href },
    });
    if (result.error) return error('If you can’t register, try signing in or requesting a password reset.');
    if (result.data.session) await client.auth.signOut({ scope: 'local' });
    return { message: 'Check your email for a confirmation link before signing in.' };
  }
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) return error('Sign-in failed. Check your credentials and email confirmation.');
  redirect('/');
}

export async function signOut() {
  const client = await supabase(true);
  if (client) await client.auth.signOut({ scope: 'local' });
  await clearRecovery();
  redirect('/login');
}

export async function requestPasswordReset(_: ActionState, form: FormData): Promise<ActionState> {
  const client = await supabase(true);
  if (!client || demo || !recoveryConfigured()) return error('Password reset is unavailable.');
  const email = value(form, 'email').trim();
  if (!emailSchema.safeParse(email).success) return error('Enter a valid email address.');
  await client.auth.resetPasswordForEmail(email, { redirectTo: new URL('/auth/recovery', authOrigin()).href });
  return { message: sendMessage };
}

export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const client = await supabase(true);
  if (!client || demo) return error('Password reset is unavailable.');
  const { data: { user } } = await client.auth.getUser();
  const { data } = await client.auth.getClaims();
  const sessionId = data?.claims.session_id;
  if (!user || typeof sessionId !== 'string' || !(await recoveryAllowed(user.id, sessionId))) {
    return error('This reset session expired. Request a new link.');
  }
  const password = value(form, 'password');
  if (!validPassword(password)) return error(passwordRule);
  if (password !== value(form, 'confirm_password')) return error('The passwords don’t match.');
  const result = await client.auth.updateUser({ password });
  if (result.error?.code === 'same_password') return error('Choose a password different from your current password.');
  if (result.error) return error('Your password could not be updated. Request a new reset link and try again.');
  await clearRecovery();
  await client.auth.signOut({ scope: 'global' });
  redirect('/login?reset=success');
}

export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Profile updates are available in the signed-in studio.');
  const { client, user } = await account(true);
  const display_name = value(form, 'display_name').trim();
  if (!display_name || display_name.length > 80) return error('Enter a display name between 1 and 80 characters.');
  const { data, error: saveError } = await client.from('profiles').update({ display_name }).eq('id', user.id).select('id').single();
  if (saveError || !data) return error('Could not update your profile.');
  revalidatePath('/', 'layout');
  return { message: 'Profile updated.' };
}

export async function deleteAccount(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Account deletion is available in the signed-in studio.');
  if (value(form, 'confirmation') !== 'DELETE MY ACCOUNT') return error('Enter the confirmation phrase.');
  const password = value(form, 'password');
  if (!password || Buffer.byteLength(password) > 1024) return error('Enter your current password.');
  const { client, user } = await account(true);
  const verifier = authClient(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '');
  const admin = accountAdmin();
  if (!verifier || !admin || !user.email) return error('Account deletion is unavailable.');
  const proof = await verifier.auth.signInWithPassword({ email: user.email, password });
  if (proof.error || proof.data.user?.id !== user.id) return error('Your current password could not be verified.');
  await verifier.auth.signOut({ scope: 'local' });
  const { error: deletionError } = await admin.auth.admin.deleteUser(user.id, false);
  if (deletionError) return error('Your account could not be deleted. Try again.');
  await client.auth.signOut({ scope: 'local' });
  await clearRecovery();
  redirect('/login?deleted=1');
}
