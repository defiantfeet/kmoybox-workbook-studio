'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { readRelationship } from './relationships';
import { boundarySchema, readBoundary } from './boundaries';
import { growthDates, growthTimezone } from './data';

const path = '/becoming/boundary-builder';
const error = (message: string): ActionState => ({ message, error: true });

export async function saveBoundary(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save a boundary.');
  const { client, user } = await account(true);
  const raw = form.get('boundary');
  const intent = form.get('intent');
  const id = form.get('id');
  const revision = form.get('revision');
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 90000 || (intent !== 'draft' && intent !== 'save')
    || (id && (!z.uuid().safeParse(id).success || !z.iso.datetime({ offset: true }).safeParse(revision).success))) {
    return error('Check the boundary and try again.');
  }
  let content: unknown;
  try { content = JSON.parse(raw); } catch { return error('Check the boundary and try again.'); }
  const parsed = boundarySchema.safeParse(content);
  if (!parsed.success) return error('Use a valid reminder date and keep each field within 2,000 characters.');
  const entry = parsed.data;
  if (intent === 'save' && !entry.zone) return error('Choose how you want to organize this boundary.');
  const table = client.from('growth_exercises');
  const existing = id ? await table.select('completed_at,answers').eq('user_id', user.id)
    .eq('module_slug', 'boundary-builder').eq('id', id).eq('updated_at', revision).maybeSingle() : null;
  if (existing && (existing.error || !existing.data)) return error('This boundary changed in another tab. Copy unsaved writing before reloading.');
  if (existing?.data?.completed_at && intent === 'draft') return error('Use Save boundary to update this entry.');
  const previousRelationship = existing?.data ? readBoundary(existing.data.answers).relationshipId : '';
  if (entry.relationshipId && entry.relationshipId !== previousRelationship) {
    const { data, error: sourceError } = await table.select('id').eq('user_id', user.id)
      .eq('id', entry.relationshipId).eq('module_slug', 'relationship-inventory').maybeSingle();
    if (sourceError || !data) return error('The linked Relationship Inventory entry is unavailable.');
  }
  const now = new Date().toISOString();
  const fields = { answers: entry, updated_at: now,
    completed_at: intent === 'save' ? existing?.data?.completed_at ?? now : null, is_current: intent === 'draft' };
  const result = id
    ? await table.update(fields).eq('id', id).eq('user_id', user.id).eq('module_slug', 'boundary-builder')
      .eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ user_id: user.id, module_slug: 'boundary-builder', ...fields }).select('id').single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) return error('Your boundary changed in another tab. Copy unsaved writing before reloading.');
  if (result.error || !result.data) return error('Your boundary could not be saved. Try again.');
  revalidatePath(path);
  revalidatePath('/becoming');
  if (intent === 'save') redirect(path + '?boundaryId=' + result.data.id + '&saved=1#boundary-editor');
  return { message: 'Boundary draft saved.' };
}

export async function importBoundaryRelationship(_: ActionState, form: FormData): Promise<ActionState & { source?: { id: string; context: string } }> {
  if (demo) return error('Sign in to link a Relationship Inventory entry.');
  const { client, user } = await account(true);
  const id = z.uuid().safeParse(form.get('relationshipId'));
  if (!id.success || form.get('confirm') !== 'yes') return error('Choose an entry and confirm the link.');
  const { data, error: failure } = await client.from('growth_exercises').select('answers').eq('user_id', user.id)
    .eq('module_slug', 'relationship-inventory').eq('id', id.data).maybeSingle();
  if (failure || !data) return error('That Relationship Inventory entry is unavailable.');
  const relationship = readRelationship(data.answers);
  const context = relationship ? relationship.reflections.boundaries || relationship.label
    : typeof data.answers?.['1'] === 'string' ? data.answers['1'] : '';
  return { message: 'Relationship entry linked to this draft.', source: { id: id.data, context } };
}

export async function addBoundaryPractice(boundaryId: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save a practice note.');
  const { client, user } = await account(true);
  const parsed = z.object({
    date: z.iso.date(), practice: z.string().trim().max(2000), reflection: z.string().trim().max(2000),
  }).safeParse({ date: form.get('date'), practice: form.get('practice'), reflection: form.get('reflection') });
  if (!z.uuid().safeParse(boundaryId).success || !parsed.success || (!parsed.data.practice && !parsed.data.reflection)) {
    return error('Choose a date and add a practice note or reflection.');
  }
  const { today } = growthDates(await growthTimezone(client, user.id));
  if (parsed.data.date > today) return error('Choose today or an earlier date.');
  const { error: failure } = await client.from('boundary_practice_entries').insert({
    user_id: user.id, boundary_id: boundaryId, occurred_on: parsed.data.date, practice: parsed.data.practice, reflection: parsed.data.reflection,
  });
  if (failure) return error('Your practice note could not be saved. Try again.');
  revalidatePath(path);
  return { message: 'Practice note saved.' };
}
