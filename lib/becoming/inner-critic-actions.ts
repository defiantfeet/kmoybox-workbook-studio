'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { dialogueSchema, hasDialogueContent, statementText } from './inner-critic';
import { emptyReframe } from './reframing';

const path = '/becoming/inner-critic-dialogue';
const error = (message: string): ActionState => ({ message, error: true });

export async function saveDialogue(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save a dialogue.');
  const { client, user } = await account(true);
  const raw = form.get('entry');
  const intent = form.get('intent');
  const id = form.get('id');
  const revision = form.get('revision');
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 115000 || (intent !== 'draft' && intent !== 'complete')
    || (revision && (!z.uuid().safeParse(id).success || !z.iso.datetime({ offset: true }).safeParse(revision).success))) {
    return error('Check the dialogue and try again.');
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return error('Check the dialogue and try again.'); }
  const parsed = dialogueSchema.safeParse(value);
  if (!parsed.success) return error('Use up to 2,000 characters per prompt and try again.');
  if (!hasDialogueContent(parsed.data)) return error('Write a response or choose a theme or emotion before saving.');
  const now = new Date().toISOString();
  const complete = intent === 'complete';
  const fields = { answers: parsed.data, updated_at: now, completed_at: complete ? now : null, is_current: !complete };
  const table = client.from('growth_exercises');
  const result = revision
    ? await table.update(fields).eq('user_id', user.id).eq('module_slug', 'inner-critic-dialogue')
      .eq('id', id).eq('is_current', true).eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ user_id: user.id, module_slug: 'inner-critic-dialogue', ...fields }).select('id').single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) return error('Your draft changed in another tab. Copy unsaved writing before reloading.');
  if (result.error) return error('Your dialogue could not be saved. Try again.');
  revalidatePath(path);
  revalidatePath('/becoming');
  return { message: complete ? 'Dialogue saved.' : 'Dialogue draft saved.' };
}

export async function addStatement(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save a supportive statement.');
  const { client, user } = await account(true);
  const body = statementText.safeParse(form.get('body'));
  if (!body.success) return error('Write a supportive statement of up to 500 characters.');
  const result = await client.from('supportive_statements').insert({ user_id: user.id, body: body.data });
  if (result.error?.code === '23505') return error('This statement is already in your collection.');
  if (result.error) return error('Your statement could not be saved. Try again.');
  revalidatePath(path);
  return { message: 'Supportive statement saved.' };
}

export async function removeStatement(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to remove a supportive statement.');
  const { client, user } = await account(true);
  const id = z.uuid().safeParse(form.get('statementId'));
  if (!id.success) return error('Choose a statement to remove.');
  const result = await client.from('supportive_statements').delete().eq('id', id.data).eq('user_id', user.id).select('id').maybeSingle();
  if (result.error || !result.data) return error('The statement could not be removed.');
  revalidatePath(path);
  return { message: 'Statement removed.' };
}

export async function sendDialogueToReframing(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to create a reframing draft.');
  const { client, user } = await account(true);
  const fields = z.object({
    thought: z.string().trim().max(2000), balanced: z.string().trim().max(2000),
  }).safeParse({ thought: form.get('thought'), balanced: form.get('balanced') });
  if (!fields.success || !Object.values(fields.data).some(Boolean)) return error('Enter a thought or compassionate response to copy.');
  const { error: failure } = await client.from('growth_exercises').insert({
    user_id: user.id, module_slug: 'cognitive-reframing', answers: { ...emptyReframe, text: fields.data },
  });
  if (failure?.code === '23505') return { message: 'Cognitive Reframing already has saved work. Open it to add your wording.' };
  if (failure) return error('The reframing draft could not be saved.');
  revalidatePath('/becoming/cognitive-reframing');
  revalidatePath('/becoming');
  return { message: 'Reframing draft saved.' };
}
