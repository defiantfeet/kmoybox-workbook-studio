'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { identityActivities, identitySchema } from './identity';

const path = '/becoming/identity-mapping';
const error = (message: string): ActionState => ({ message, error: true });

export async function saveIdentity(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save your identity map.');
  const { client, user } = await account(true);
  const raw = form.get('map');
  const intent = form.get('intent');
  const revision = form.get('revision');
  const id = form.get('id');
  if (typeof raw !== 'string' || raw.length > 45000 || (intent !== 'draft' && intent !== 'version')
    || (revision && (!z.iso.datetime({ offset: true }).safeParse(revision).success || !z.uuid().safeParse(id).success))) {
    return error('Check your map and try again.');
  }
  let answers: unknown;
  try { answers = JSON.parse(raw); } catch { return error('Check your map and try again.'); }
  const parsed = identitySchema.safeParse(answers);
  if (!parsed.success) return error('Give each node a name and connect only nodes that are on the map.');
  const now = new Date().toISOString();
  const version = intent === 'version';
  const fields = { answers: parsed.data, updated_at: now, completed_at: version ? now : null, is_current: !version };
  const table = client.from('growth_exercises');
  const result = revision
    ? await table.update(fields).eq('id', id).eq('user_id', user.id).eq('module_slug', 'identity-mapping')
      .eq('is_current', true).eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ ...fields, user_id: user.id, module_slug: 'identity-mapping' }).select('id').single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) return error('Your map changed in another tab. Copy unsaved writing before refreshing.');
  if (result.error) return error('Your map could not be saved. Try again.');
  revalidatePath(path);
  revalidatePath('/becoming');
  return { message: version ? 'Dated version saved.' : 'Identity draft saved.' };
}

export async function sendIdentityPractice(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to create a practice draft.');
  const { client, user } = await account(true);
  const kind = z.enum(['boundary', 'social']).safeParse(form.get('kind'));
  const text = z.string().trim().min(1).max(500).safeParse(form.get('step'));
  if (!kind.success || !text.success) return error('Enter a short next step before saving.');
  const activity = identityActivities[kind.data];
  const result = await client.from('growth_exercises').insert({
    user_id: user.id, module_slug: activity.slug, answers: { [activity.field]: text.data },
  });
  if (result.error?.code === '23505') return { message: 'That exercise already has saved work. Open it to add your next step.' };
  if (result.error) return error('The practice draft could not be saved. Try again.');
  revalidatePath('/becoming/' + activity.slug);
  revalidatePath('/becoming');
  return { message: 'Practice draft saved. Open the exercise to continue.' };
}
