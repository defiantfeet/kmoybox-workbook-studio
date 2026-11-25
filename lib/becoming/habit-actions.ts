'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { growthDates, growthTimezone } from './data';
import { habitPath, habitSchema, habitStates } from './habits';

const fail = (message: string): ActionState => ({ message, error: true });
function refresh() {
  revalidatePath(habitPath);
  revalidatePath('/becoming');
}
const uuid = z.uuid();
const revision = z.iso.datetime({ offset: true });

export async function saveHabit(id: string, version: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to save a habit.');
  const { client, user } = await account(true);
  const raw = form.get('habit');
  let input: unknown;
  if (typeof raw === 'string' && Buffer.byteLength(raw, 'utf8') <= 25000) {
    try { input = JSON.parse(raw); } catch { input = null; }
  }
  const parsed = habitSchema.safeParse(input);
  if (!parsed.success) return fail('Check the schedule, dates, and reminder time before saving.');
  const table = client.from('growth_habits');
  if (id && (!uuid.safeParse(id).success || !revision.safeParse(version).success)) return fail('Reopen the habit to edit it.');
  const result = id ? await table.update(parsed.data).eq('id', id).eq('user_id', user.id).eq('updated_at', version).select('id').maybeSingle()
    : await table.insert({ ...parsed.data, user_id: user.id }).select('id').single();
  if (result.error || !result.data) return fail('The habit could not be saved or has changed in another tab.');
  refresh();
  return { message: id ? 'Habit saved.' : 'Habit added.' };
}

export async function manageHabit(id: string, version: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo || !uuid.safeParse(id).success || !revision.safeParse(version).success) return fail('Reopen the habit and try again.');
  const { client, user } = await account(true);
  const intent = form.get('intent');
  const table = client.from('growth_habits');
  let result;
  if (intent === 'delete' && form.get('confirm') === 'yes') {
    result = await table.delete().eq('id', id).eq('user_id', user.id).eq('updated_at', version).select('id').maybeSingle();
  } else if (intent === 'pause' || intent === 'resume') {
    result = await table.update({ paused: intent === 'pause' }).eq('id', id).eq('user_id', user.id)
      .eq('updated_at', version).is('archived_on', null).select('id').maybeSingle();
  } else if (intent === 'archive') {
    const { today } = growthDates(await growthTimezone(client, user.id));
    const { data } = await table.select('started_on').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!data) return fail('The habit is unavailable.');
    result = await table.update({ archived_on: today < data.started_on ? data.started_on : today }).eq('id', id)
      .eq('user_id', user.id).eq('updated_at', version).is('archived_on', null).select('id').maybeSingle();
  } else return fail('Choose an action or confirm deletion.');
  if (result.error || !result.data) return fail('The habit could not be updated or changed in another tab.');
  refresh();
  return { message: 'Habit updated.' };
}

export async function saveHabitLog(id: string, day: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo || !uuid.safeParse(id).success || !z.iso.date().safeParse(day).success) return fail('Choose a habit and date.');
  const state = z.enum(habitStates).safeParse(form.get('state'));
  const raw = form.get('amount');
  const amount = raw === null || raw === '' ? null : Number(raw);
  if (!state.success || (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000))) return fail('Choose a completion state and a valid amount.');
  const { client, user } = await account(true);
  const table = client.from('growth_habit_logs');
  const result = state.data === 'Not recorded' ? await table.delete().eq('habit_id', id).eq('local_date', day).eq('user_id', user.id)
    : await table.upsert({ habit_id: id, local_date: day, user_id: user.id, state: state.data,
      amount: ['Completed', 'Partially completed'].includes(state.data) ? amount : null }, { onConflict: 'habit_id,local_date' });
  if (result.error) return fail('This date could not be recorded. Check the habit schedule.');
  refresh();
  return { message: 'Activity saved.' };
}
