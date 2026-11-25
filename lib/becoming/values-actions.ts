'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { practiceKinds, practiceLabels, readyToComplete, valuesSchema } from './values';

const route = '/becoming/values-assessment';
const failure = (message: string): ActionState => ({ message, error: true });

export async function saveValues(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return failure('Sign in to save an assessment.');
  const { client, user } = await account(true);
  const intent = form.get('intent');
  const raw = form.get('answers');
  const revision = form.get('revision');
  const id = form.get('id');
  if ((intent !== 'draft' && intent !== 'complete') || typeof raw !== 'string' || raw.length > 105000
    || (revision && (!z.iso.datetime({ offset: true }).safeParse(revision).success || !z.uuid().safeParse(id).success))) {
    return failure('Check your selections and try again.');
  }
  let content: unknown;
  try { content = JSON.parse(raw); } catch { return failure('Check your selections and try again.'); }
  const parsed = valuesSchema.safeParse(content);
  if (!parsed.success) return failure('Use unique values and keep reflections within their character limits.');
  const complete = intent === 'complete';
  if (complete && !readyToComplete(parsed.data)) {
    return failure('Choose ten shortlisted values, rank five core values, and save a statement before completing.');
  }
  const now = new Date().toISOString();
  const fields = { answers: parsed.data, updated_at: now, completed_at: complete ? now : null, is_current: !complete };
  const table = client.from('growth_exercises');
  const result = revision
    ? await table.update(fields).eq('id', id).eq('user_id', user.id).eq('module_slug', 'values-assessment')
      .eq('is_current', true).eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ ...fields, user_id: user.id, module_slug: 'values-assessment' }).select('id').single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) {
    return failure('This draft changed in another tab. Copy any unsaved writing before reloading.');
  }
  if (result.error) return failure('Your assessment could not be saved. Try again.');
  revalidatePath(route);
  revalidatePath('/becoming');
  return { message: complete ? 'Values assessment completed.' : 'Values draft saved.' };
}

export async function connectValue(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return failure('Sign in to connect a value.');
  const { client } = await account(true);
  const parsed = z.object({
    assessment: z.uuid(), value: z.string().regex(/^[a-z0-9-]{1,48}$/),
    kind: z.enum(practiceKinds), step: z.string().trim().min(1).max(140),
  }).safeParse({ assessment: form.get('assessment'), value: form.get('value'), kind: form.get('kind'), step: form.get('step') });
  if (!parsed.success) return failure('Choose a core value and describe a small next step.');
  const { assessment, value, kind, step } = parsed.data;
  if (kind === 'habit' && step.length > 80) return failure('Keep the habit name within 80 characters.');
  const { error } = await client.rpc('connect_values_practice', {
    assessment_uuid: assessment, core_value: value, practice_kind: kind, next_step: step,
  });
  if (error) return failure('This value could not be connected. Try again.');
  revalidatePath(route);
  revalidatePath('/becoming');
  revalidatePath(practiceLabels[kind].href);
  return { message: 'Practice connected.' };
}
