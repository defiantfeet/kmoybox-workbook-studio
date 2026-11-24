'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { bodyPath, readBody } from './body';

export async function saveBody(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return { message: 'Sign in to save a private observation.', error: true };
  const { client, user } = await account(true);
  const raw = form.get('entry');
  let parsed: unknown;
  if (typeof raw === 'string' && Buffer.byteLength(raw, 'utf8') <= 115000) {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  }
  const entry = readBody(parsed);
  if (!entry) return { message: 'Select a region or write a movement reflection. Name any custom sensations and check the field limits.', error: true };
  const completed = new Date().toISOString();
  const { data, error } = await client.from('growth_exercises').insert({
    user_id: user.id, module_slug: 'body-awareness-map', answers: entry,
    completed_at: completed, updated_at: completed, is_current: false,
  }).select('id').single();
  if (error || !data) return { message: 'Your observation could not be saved. Try again.', error: true };
  revalidatePath('/becoming');
  revalidatePath(bodyPath);
  redirect(bodyPath + '?observation=' + data.id + '&saved=1#body-history');
}
