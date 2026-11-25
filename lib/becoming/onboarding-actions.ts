'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { onboardingPath, onboardingSchema } from './onboarding';

const fail = (message: string): ActionState => ({ message, error: true });

export async function saveOnboarding(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to save your preferences.');
  const { client, user } = await account(true);
  const raw = form.get('preferences');
  let input: unknown;
  if (typeof raw === 'string' && Buffer.byteLength(raw, 'utf8') <= 10000) {
    try { input = JSON.parse(raw); } catch { input = null; }
  }
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return fail('Check the optional fields and choose distinct check-in times.');
  const { error } = await client.from('notification_preferences').upsert({
    user_id: user.id, onboarding_status: 'saved', growth_onboarding: parsed.data,
  }, { onConflict: 'user_id' });
  if (error) return fail('Your preferences could not be saved. Try again.');
  revalidatePath('/becoming');
  revalidatePath(onboardingPath);
  return { message: 'Starting plan preferences saved.' };
}

export async function skipOnboarding(_: ActionState, __: FormData): Promise<ActionState> {
  if (demo) redirect('/becoming');
  const { client, user } = await account(true);
  const { error } = await client.from('notification_preferences').upsert({
    user_id: user.id, onboarding_status: 'skipped',
  }, { onConflict: 'user_id' });
  if (error) return fail('Your preference could not be saved. You can still return to the Studio.');
  revalidatePath('/becoming');
  revalidatePath(onboardingPath);
  redirect('/becoming');
}
