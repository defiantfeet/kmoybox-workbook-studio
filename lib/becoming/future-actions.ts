'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { growthDates, growthTimezone } from './data';
import { futureFields, futurePath, horizonDate, readFuture } from './future';

const fail = (message: string): ActionState => ({ message, error: true });

export async function saveFuture(id: string, revision: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to save a private reflection.');
  const { client, user } = await account(true);
  if (id && (!z.uuid().safeParse(id).success || !z.iso.datetime({ offset: true }).safeParse(revision).success)) {
    return fail('Reopen this reflection before saving.');
  }
  const raw = form.get('entry');
  let input: unknown;
  if (typeof raw === 'string' && Buffer.byteLength(raw, 'utf8') <= 115000) {
    try { input = JSON.parse(raw); } catch { input = null; }
  }
  const parsed = futureFields.safeParse(input);
  if (!parsed.success) return fail('Choose a valid horizon and check the field limits.');
  const table = client.from('growth_exercises');
  const existing = id ? await table.select('answers').eq('id', id).eq('user_id', user.id)
    .eq('module_slug', 'future-self-visualization').eq('updated_at', revision).maybeSingle() : null;
  const previous = readFuture(existing?.data?.answers);
  if (id && (!previous || existing?.error)) return fail('This entry is unavailable or changed in another tab. Copy your edits before reloading.');
  const { today } = growthDates(await growthTimezone(client, user.id));
  const origin = previous?.origin ?? today;
  const { horizon, customDate, reflectionDate } = parsed.data;
  const target = horizonDate(origin, horizon, customDate);
  if (!z.iso.date().safeParse(target).success || target < origin) return fail('Choose a horizon date on or after the day this reflection began.');
  if (reflectionDate && reflectionDate !== previous?.reflectionDate && reflectionDate < today) {
    return fail('Choose today or a future day for your scheduled reflection.');
  }
  const answers = { ...parsed.data, format: 'future-v1', origin, target };
  const now = new Date().toISOString();
  const result = id
    ? await table.update({ answers, updated_at: now }).eq('id', id).eq('user_id', user.id)
      .eq('module_slug', 'future-self-visualization').eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ answers, user_id: user.id, module_slug: 'future-self-visualization',
      is_current: false, completed_at: now, updated_at: now }).select('id').single();
  if (result.error) return fail('Your reflection could not be saved. Try again.');
  if (!result.data) return fail('This entry changed in another tab. Copy your edits before reloading.');
  revalidatePath('/becoming');
  revalidatePath(futurePath);
  redirect(futurePath + '?entry=' + result.data.id + '&saved=1#future-editor');
}

export async function createFutureGoal(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to create a growth goal.');
  const { client } = await account(true);
  const title = z.string().trim().min(1).max(140).safeParse(form.get('title'));
  const target = z.union([z.literal(''), z.iso.date()]).safeParse(form.get('target'));
  const milestones = z.array(z.string().trim().max(140)).max(5).safeParse(form.getAll('milestone'));
  if (!title.success || !target.success || !milestones.success) return fail('Enter a goal and keep each milestone within 140 characters.');
  const { error } = await client.rpc('create_future_self_goal', {
    goal_title: title.data, target_day: target.data || null, milestone_titles: milestones.data.filter(Boolean),
  });
  if (error) return fail('Your goal could not be created. Try again.');
  revalidatePath('/goals');
  revalidatePath('/becoming');
  return { message: 'Goal and milestones saved.' };
}
