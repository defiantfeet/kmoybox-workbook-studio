'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { growthTimezones } from './data';
import { moodInput, moodPath, moodSettingsSchema, moodSlots } from './mood';

const fail = (message: string): ActionState => ({ message, error: true });
const revision = z.iso.datetime({ offset: true });

function formJson(form: FormData, name: string, limit: number): unknown {
  const raw = form.get(name);
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > limit) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function refresh() {
  revalidatePath(moodPath);
  revalidatePath('/becoming');
}

export async function saveMood(id: string, version: string, slot: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to save a private check-in.');
  const { client, user } = await account(true);
  if (id && (!z.uuid().safeParse(id).success || !revision.safeParse(version).success)) return fail('Reopen this check-in before editing.');
  if (!id && slot !== null && !moodSlots.some(value => value === slot)) return fail('Choose a check-in time.');
  const parsed = moodInput.safeParse(formJson(form, 'entry', 60000));
  if (!parsed.success || (!id && !parsed.data.rating)) return fail('Choose an overall mood rating and check the optional field limits.');
  const entry = parsed.data;
  const payload = { mood_rating: entry.rating, energy_rating: entry.energy, emotion_labels: entry.emotions,
    note: entry.note, context_tags: entry.tags, details: { scales: entry.scales, notes: entry.details } };
  const table = client.from('growth_check_ins');
  const result = id ? await table.update(payload).eq('user_id', user.id).eq('id', id).eq('updated_at', version).select('id,local_date').maybeSingle()
    : await table.insert({ ...payload, user_id: user.id, slot, occurred_at: new Date().toISOString() }).select('id,local_date').single();
  if (result.error?.code === '23505') return fail('That scheduled check-in already exists. You can edit it from history or add a voluntary check-in.');
  if (result.error || !result.data) return fail('This check-in could not be saved or changed in another tab.');
  refresh();
  redirect(moodPath + '?day=' + result.data.local_date + '&entry=' + result.data.id + '&saved=1#mood-history');
}

export async function deleteMood(id: string, version: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo || !z.uuid().safeParse(id).success || !revision.safeParse(version).success || form.get('confirm') !== 'yes') {
    return fail('Confirm deletion to remove this check-in.');
  }
  const { client, user } = await account(true);
  const result = await client.from('growth_check_ins').delete().eq('user_id', user.id).eq('id', id).eq('updated_at', version)
    .select('id,local_date').maybeSingle();
  if (result.error || !result.data) return fail('The check-in could not be deleted or changed in another tab.');
  refresh();
  redirect(moodPath + '?deleted=1#mood-history');
}

export async function saveMoodSettings(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to save reminder preferences.');
  const { client } = await account(true);
  const timezone = form.get('timezone');
  const settings = moodSettingsSchema.safeParse(formJson(form, 'settings', 8000));
  if (typeof timezone !== 'string' || !growthTimezones.includes(timezone) || !settings.success) {
    return fail('Choose a timezone and check the times and quiet hours.');
  }
  const { error } = await client.rpc('save_mood_preferences', { zone: timezone, preferences: settings.data });
  if (error) return fail('Preferences could not be saved.');
  refresh();
  return { message: 'Mood preferences saved.' };
}
