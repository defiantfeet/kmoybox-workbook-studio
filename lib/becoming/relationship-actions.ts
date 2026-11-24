'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { growthDates, growthTimezone } from './data';
import { readRelationship, relationshipDetails } from './relationships';

const path = '/becoming/relationship-inventory';
const fail = (message: string): ActionState => ({ message, error: true });

export async function saveRelationship(id: string, revision: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to save your relationship inventory.');
  const { client, user } = await account(true);
  if (id && (!z.uuid().safeParse(id).success || !z.iso.datetime({ offset: true }).safeParse(revision).success)) {
    return fail('Reopen the relationship and try again.');
  }

  const table = client.from('growth_exercises');
  const existing = id ? await table.select('answers').eq('id', id).eq('user_id', user.id)
    .eq('module_slug', 'relationship-inventory').eq('updated_at', revision).maybeSingle() : null;
  const previous = readRelationship(existing?.data?.answers);
  if (id && (!previous || existing?.error)) return fail('This relationship is unavailable or changed in another tab. Copy unsaved writing before reloading.');

  const intent = form.get('intent');
  let answers;
  if (intent === 'review' && previous) {
    const note = z.string().trim().min(1).max(2000).safeParse(form.get('review'));
    if (!note.success || !previous.intention) return fail('Save an intention and write a short review first.');
    if (previous.reviews.length >= 100) return fail('This intention history has reached 100 reviews.');
    const timezone = await growthTimezone(client, user.id);
    const dates = growthDates(timezone);
    answers = { ...previous, reviews: [...previous.reviews, { date: dates.today, intention: previous.intention, note: note.data }] };
  } else if (intent === 'details') {
    const raw = form.get('relationship');
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 65000) return fail('Check your responses and try again.');
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return fail('Check your responses and try again.'); }
    const details = relationshipDetails.safeParse(value);
    if (!details.success) return fail('Enter a label and check that optional ratings and responses fit the listed limits.');
    answers = { ...details.data, format: 'relationship-v1', reviews: previous?.reviews ?? [] };
  } else {
    return fail('Choose what you want to save.');
  }

  // Leave room for PostgreSQL's JSON serialization within the existing row size constraint.
  if (Buffer.byteLength(JSON.stringify(answers), 'utf8') > 117000) {
    return fail('This relationship has reached its storage limit. Shorten the new text and try again.');
  }

  const now = new Date().toISOString();
  const result = id
    ? await table.update({ answers, updated_at: now }).eq('id', id).eq('user_id', user.id)
      .eq('module_slug', 'relationship-inventory').eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ user_id: user.id, module_slug: 'relationship-inventory', answers,
      is_current: false, completed_at: now, updated_at: now }).select('id').single();
  if (result.error) return fail('Your changes could not be saved. Try again.');
  if (!result.data) return fail('This relationship changed in another tab. Copy unsaved writing before reloading.');

  revalidatePath(path);
  revalidatePath('/becoming');
  redirect(path + '?relationshipId=' + result.data.id + '&saved=' + intent + '#relationship-editor');
}
