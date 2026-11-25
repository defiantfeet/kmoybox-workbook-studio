'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { reframeSchema, thoughtToReframe, type ReframeEntry } from './reframing';
import { readThought } from './thought-record';

const path = '/becoming/cognitive-reframing';
const error = (message: string): ActionState => ({ message, error: true });

export async function loadThoughtImport(_: ActionState, form: FormData): Promise<ActionState & { entry?: ReframeEntry }> {
  if (demo) return error('Sign in to import a Thought Record.');
  const { client, user } = await account(true);
  const id = z.uuid().safeParse(form.get('thoughtId'));
  if (!id.success || form.get('confirm') !== 'yes') return error('Choose a record and confirm you want to copy it.');
  const { data, error: failure } = await client.from('growth_exercises').select('answers').eq('user_id', user.id)
    .eq('module_slug', 'thought-record').eq('id', id.data).maybeSingle();
  if (failure || !data) return error('That Thought Record is unavailable.');
  return { message: 'Thought Record copied into blank fields. Review the draft before saving.', entry: thoughtToReframe(readThought(data.answers)) };
}

export async function saveReframe(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save a reflection.');
  const { client, user } = await account(true);
  const raw = form.get('record');
  const intent = form.get('intent');
  const id = form.get('id');
  const revision = form.get('revision');
  if (typeof raw !== 'string' || raw.length > 50000 || (intent !== 'draft' && intent !== 'complete')
    || (revision && (!z.uuid().safeParse(id).success || !z.iso.datetime({ offset: true }).safeParse(revision).success))) {
    return error('Check the entry and try again.');
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return error('Check the entry and try again.'); }
  const parsed = reframeSchema.safeParse(value);
  if (!parsed.success) return error('Use whole numbers from 0 to 100 for ratings and keep notes within their limits.');
  const complete = intent === 'complete';
  if (complete && parsed.data.stage !== 5) return error('Review the final step before completing the entry.');
  const now = new Date().toISOString();
  const fields = { answers: parsed.data, updated_at: now, completed_at: complete ? now : null, is_current: !complete };
  const table = client.from('growth_exercises');
  const result = revision
    ? await table.update(fields).eq('user_id', user.id).eq('module_slug', 'cognitive-reframing')
      .eq('id', id).eq('is_current', true).eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ user_id: user.id, module_slug: 'cognitive-reframing', ...fields }).select('id').single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) return error('Your draft changed in another tab. Copy unsaved writing before reloading.');
  if (result.error) return error('Your reflection could not be saved. Try again.');
  revalidatePath(path);
  revalidatePath('/becoming');
  return { message: complete ? 'Reframing entry completed.' : 'Reframing draft saved.' };
}
