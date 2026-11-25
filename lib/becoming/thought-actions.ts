'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { emotionLabel } from './emotions';
import { moods } from './catalog';
import { growthDates, growthTimezone } from './data';
import { thoughtSchema } from './thought-record';

const thoughtPath = '/becoming/thought-record';
const error = (message: string): ActionState => ({ message, error: true });

export async function saveThought(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save a thought record.');
  const { client, user } = await account(true);
  const raw = form.get('record');
  const intent = form.get('intent');
  const revision = form.get('revision');
  const id = form.get('id');
  if (typeof raw !== 'string' || raw.length > 45000 || (intent !== 'draft' && intent !== 'complete')
    || (revision && (!z.iso.datetime({ offset: true }).safeParse(revision).success || !z.uuid().safeParse(id).success))) {
    return error('Check the date, time, and ratings before saving.');
  }
  let content: unknown;
  try { content = JSON.parse(raw); } catch { return error('Check your entry and try again.'); }
  const parsed = thoughtSchema.safeParse(content);
  if (!parsed.success) return error('Use a valid date or time and whole numbers from 0 to 100 for any ratings.');
  const timezone = await growthTimezone(client, user.id);
  const complete = intent === 'complete';
  const now = new Date().toISOString();
  const fields = { answers: { ...parsed.data, timezone }, updated_at: now, completed_at: complete ? now : null, is_current: !complete };
  const table = client.from('growth_exercises');
  const result = revision
    ? await table.update(fields).eq('id', id).eq('user_id', user.id).eq('module_slug', 'thought-record')
      .eq('is_current', true).eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ ...fields, user_id: user.id, module_slug: 'thought-record' }).select('id').single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) {
    return error('Your draft changed in another tab. Copy unsaved writing before reloading.');
  }
  if (result.error) return error('Your thought record could not be saved. Try again.');
  revalidatePath(thoughtPath);
  revalidatePath('/becoming');
  return { message: complete ? 'Thought record completed.' : 'Thought record draft saved.' };
}

export async function sendThoughtToReframing(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save a reframing draft.');
  const { client, user } = await account(true);
  const fields = z.object({
    thought: z.string().trim().max(2000), perspective: z.string().trim().max(2000), balanced: z.string().trim().max(2000),
  }).safeParse({ thought: form.get('thought'), perspective: form.get('perspective'), balanced: form.get('balanced') });
  if (!fields.success || !Object.values(fields.data).some(Boolean)) return error('Enter a thought, perspective, or helpful response to save.');
  const { thought, perspective, balanced } = fields.data;
  const result = await client.from('growth_exercises').insert({
    user_id: user.id, module_slug: 'cognitive-reframing', answers: { '0': thought, '1': perspective, '2': balanced },
  });
  if (result.error?.code === '23505') return { message: 'Cognitive Reframing already has saved work. Open it to add your thoughts.' };
  if (result.error) return error('Your reframing draft could not be saved. Try again.');
  revalidatePath('/becoming/cognitive-reframing');
  revalidatePath('/becoming');
  return { message: 'Reframing draft saved.' };
}

export async function sendThoughtMood(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to add a mood check-in.');
  const { client, user } = await account(true);
  const mood = emotionLabel.safeParse(form.get('mood'));
  if (!mood.success) return error('Choose an emotion to save.');
  const { today } = growthDates(await growthTimezone(client, user.id));
  const result = await client.from('growth_check_ins').insert({ user_id: user.id, local_date: today, slot: 'daily', mood: moods.includes(mood.data) ? mood.data : 'Mixed', emotion_labels: [mood.data] });
  if (result.error?.code === '23505') return { message: 'You already have a daily check-in. Open Mood Tracker to edit it.' };
  if (result.error) return error('Your mood check-in could not be saved. Try again.');
  revalidatePath('/becoming/mood-tracker');
  revalidatePath('/becoming');
  return { message: 'Emotion saved to today’s check-in.' };
}
