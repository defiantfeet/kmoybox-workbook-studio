import 'server-only';

import { z } from 'zod';
import type { account } from '../data';
import { emotionList } from './emotions';

type Client = Awaited<ReturnType<typeof account>>['client'];

export async function connectedExercise(client: Client | null, owner: string, source: unknown, module: string, format: string) {
  const id = z.uuid().safeParse(source);
  if (!client || !id.success) return null;
  const { data, error } = await client.from('growth_exercises').select('answers').eq('user_id', owner)
    .eq('id', id.data).eq('module_slug', module).eq('answers->>format', format).not('completed_at', 'is', null).maybeSingle();
  if (error) throw new Error('The selected private entry could not be loaded.');
  return data?.answers ?? null;
}

export async function connectedMoodEmotions(client: Client | null, owner: string, source: unknown) {
  const id = z.uuid().safeParse(source);
  if (!client || !id.success) return [];
  const { data, error } = await client.from('growth_check_ins').select('emotion_labels,mood')
    .eq('user_id', owner).eq('id', id.data).maybeSingle();
  if (error) throw new Error('The selected private check-in could not be loaded.');
  return connectionEmotionLabels(data?.emotion_labels?.length ? data.emotion_labels : data?.mood ? [data.mood] : []);
}

export function connectionEmotionLabels(input: unknown) {
  const result = emotionList.safeParse(input);
  return result.success ? result.data : [];
}
