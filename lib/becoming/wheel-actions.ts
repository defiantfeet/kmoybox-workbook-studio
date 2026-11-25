'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { save, type ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { growthDates, growthTimezone } from './data';
import { wheelSchema } from './wheel';

const error = (message: string): ActionState => ({ message, error: true });

function refreshWheel() {
  revalidatePath('/becoming');
  revalidatePath('/becoming/wheel-of-life');
}

export async function saveWheel(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save an assessment.');
  const { client, user } = await account(true);
  const raw = form.get('answers');
  const intent = form.get('intent');
  if (typeof raw !== 'string' || raw.length > 40000 || (intent !== 'draft' && intent !== 'complete')) {
    return error('Check your domains and try again.');
  }

  let value: unknown;
  try { value = JSON.parse(raw); } catch { return error('Check your domains and try again.'); }
  const parsed = wheelSchema.safeParse(value);
  if (!parsed.success) return error('Use unique domain names and ratings from 1 to 10. Notes can be up to 2,000 characters.');
  const complete = intent === 'complete';
  if (complete && parsed.data.domains.some(domain => domain.rating === null)) {
    return error('Rate every domain before completing your assessment.');
  }

  const revision = form.get('revision');
  const id = form.get('id');
  const table = client.from('growth_exercises');
  const now = new Date().toISOString();
  const fields = { answers: parsed.data, updated_at: now, completed_at: complete ? now : null, is_current: !complete };
  if (revision && (!z.iso.datetime({ offset: true }).safeParse(revision).success || !z.uuid().safeParse(id).success)) {
    return error('Refresh the page before saving this assessment.');
  }
  const result = revision
    ? await table.update(fields).eq('user_id', user.id).eq('module_slug', 'wheel-of-life')
      .eq('id', id).eq('is_current', true).eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ ...fields, user_id: user.id, module_slug: 'wheel-of-life' }).select('id').single();

  if (result.error?.code === '23505' || !result.error && !result.data) {
    return error('This assessment changed in another tab. Copy any notes before reloading.');
  }
  if (result.error) return error('Your assessment could not be saved. Try again.');
  refreshWheel();
  return { message: complete ? 'Assessment completed.' : 'Assessment draft saved.' };
}

export async function saveWheelGoal(state: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to create a growth goal.');
  const goal = new FormData();
  goal.set('title', String(form.get('title') ?? ''));
  goal.set('date', String(form.get('date') ?? ''));
  return save('goal', state, goal);
}

export async function saveWheelReminder(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to set a reminder.');
  const { client, user } = await account(true);
  const enabled = form.get('enabled');
  if (enabled !== 'yes' && enabled !== 'no') return error('Choose a reminder setting.');
  const today = growthDates(await growthTimezone(client, user.id)).today;
  const { error: failure } = await client.from('notification_preferences')
    .upsert({ user_id: user.id, wheel_reminder_since: enabled === 'yes' ? today : null }, { onConflict: 'user_id' });
  if (failure) return error('Your reminder setting could not be saved.');
  refreshWheel();
  return { message: enabled === 'yes' ? 'Monthly reminder enabled.' : 'Monthly reminder disabled.' };
}
