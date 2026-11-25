'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { emotionEntrySchema, parseEmotionField } from './emotions';

const error = (message: string): ActionState => ({ message, error: true });

export async function saveEmotion(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save an emotion entry.');
  const { client, user } = await account(true);
  const emotions = parseEmotionField(form.get('emotions'));
  const raw = form.get('intensity');
  const parsed = emotionEntrySchema.safeParse({
    format: 'emotion-v1', emotions: emotions.data, intensity: raw === '' || raw === null ? null : Number(raw),
    sensations: form.get('sensations'), context: form.get('context'), reflection: form.get('reflection'),
  });
  if (!parsed.success) return error('Choose at least one emotion and use a whole number from 0 to 100 for intensity, if you add one.');
  const now = new Date().toISOString();
  const id = form.get('id');
  const revision = form.get('revision');
  if (id && (!z.uuid().safeParse(id).success || !z.iso.datetime({ offset: true }).safeParse(revision).success)) {
    return error('Reload the earlier draft before saving.');
  }
  const table = client.from('growth_exercises');
  const fields = { answers: parsed.data, updated_at: now, completed_at: now, is_current: false };
  const result = id
    ? await table.update(fields).eq('user_id', user.id).eq('module_slug', 'emotional-wheel')
      .eq('id', id).eq('updated_at', revision).eq('is_current', true).select('id').maybeSingle()
    : await table.insert({ user_id: user.id, module_slug: 'emotional-wheel', ...fields }).select('id').single();
  if (!result.error && !result.data) return error('Your earlier draft changed. Reload before saving.');
  if (result.error) return error('Your emotion entry could not be saved. Try again.');
  revalidatePath('/becoming/emotional-wheel');
  revalidatePath('/becoming');
  return { message: 'Emotion entry saved.' };
}
