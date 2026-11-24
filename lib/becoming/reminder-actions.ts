'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { growthTimezones } from './data';
import { remindersPath, reminderSettingsSchema } from './reminders';

const fail = (message: string): ActionState => ({ message, error: true });

export async function saveReminderSettings(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to save reminder settings.');
  const { client } = await account(true);
  const raw = form.get('settings');
  let input: unknown;
  if (typeof raw === 'string' && Buffer.byteLength(raw, 'utf8') <= 12000) {
    try { input = JSON.parse(raw); } catch { input = null; }
  }
  const settings = reminderSettingsSchema.safeParse(input);
  const zone = form.get('timezone');
  if (!settings.success || typeof zone !== 'string' || !growthTimezones.includes(zone)) return fail('Check the timezone, schedule times, and quiet hours.');
  const { error } = await client.rpc('save_central_reminders', { zone, config: settings.data });
  if (error) return fail('Your reminder settings could not be saved.');
  revalidatePath('/becoming', 'layout');
  revalidatePath(remindersPath);
  return { message: 'Reminder settings saved.' };
}

export async function pauseReminders(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to change your reminders.');
  const { client, user } = await account(true);
  const action = form.get('pause');
  if (action !== '24h' && action !== 'resume') return fail('Choose pause or resume.');
  const { data, error } = await client.from('notification_preferences').update({
    reminders_paused_until: action === 'resume' ? null : new Date(Date.now() + 86400000).toISOString(),
  }).eq('user_id', user.id).not('central_reminders', 'is', null).select('id').maybeSingle();
  if (error || !data) return fail('Save centralized settings before pausing reminders.');
  revalidatePath(remindersPath);
  return { message: action === 'resume' ? 'Reminders resumed.' : 'Reminders paused for 24 hours.' };
}

export async function respondToReminder(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo || !z.uuid().safeParse(id).success) return fail('This reminder is unavailable.');
  const { client, user } = await account(true);
  const action = form.get('action');
  const now = new Date();
  let fields;
  if (action === 'dismiss') fields = { dismissed_at: now.toISOString() };
  else if (action === '15' || action === '60' || action === '1440') fields = {
    snoozed_until: new Date(now.valueOf() + Number(action) * 60000).toISOString(), browser_claimed_at: null,
  };
  else return fail('Choose a snooze time or dismiss.');
  const { data, error } = await client.from('growth_reminder_events').update(fields)
    .eq('id', id).eq('user_id', user.id).is('dismissed_at', null).select('id').maybeSingle();
  if (error || !data) return fail('This reminder could not be updated.');
  return { message: action === 'dismiss' ? 'Reminder dismissed.' : 'Reminder snoozed.' };
}
