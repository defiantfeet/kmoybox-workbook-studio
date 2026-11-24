'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { checkIns, findModule, moods, reflection } from './catalog';
import { emotionPickerModules, parseEmotionField } from './emotions';
import { growthDates, growthTimezone, growthTimezones } from './data';

const failure = (message: string): ActionState => ({ message, error: true });
const unavailable = () => failure('Sign in to save your Personal Growth activity.');
const conflict = () => failure('This activity changed in another tab. Copy your edits before reloading.');
const formValue = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

function readAnswers(fields: typeof reflection.fields | NonNullable<ReturnType<typeof findModule>>['fields'], form: FormData) {
  const answers = Object.fromEntries(fields.map((_, index) => [String(index), formValue(form, String(index))]));
  return fields.some((field, index) => answers[index].length > 2000
    || (field.options && answers[index] && !field.options.includes(answers[index]))) ? null : answers;
}

function refresh(slug?: string) {
  revalidatePath('/becoming');
  if (slug) revalidatePath('/becoming/' + slug);
}

export async function saveExercise(slug: string, previous: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return unavailable();
  const { client, user } = await account(true);
  const module = findModule(slug);
  if (!module?.fields.length) return failure('Exercise unavailable.');
  const answers = readAnswers(module.fields, form);
  const emotions = parseEmotionField(form.get('emotions'));
  if (!emotions.success) return failure('Choose up to 12 distinct emotions.');
  const intent = formValue(form, 'intent');
  if (!answers || (!Object.values(answers).some(Boolean) && !emotions.data.length) || !['draft', 'complete'].includes(intent)) {
    return failure('Enter at least one valid response before saving.');
  }
  if (intent === 'complete' && !Object.values(answers).every(Boolean)) return failure('Answer each prompt to mark this exercise complete.');

  const revision = formValue(form, 'revision');
  const now = new Date().toISOString();
  const fields = { answers: emotionPickerModules.includes(slug) && emotions.data.length
    ? { ...answers, emotions: emotions.data } : answers, updated_at: now, completed_at: intent === 'complete' ? now : null };
  const table = client.from('growth_exercises');
  const result = revision
    ? await table.update(fields).eq('user_id', user.id).eq('module_slug', slug).eq('is_current', true).eq('updated_at', revision).select('module_slug').maybeSingle()
    : await table.insert({ user_id: user.id, module_slug: slug, ...fields }).select('module_slug').single();
  if (result.error?.code === '23505' || !result.error && !result.data) return conflict();
  if (result.error) return failure('Could not save your exercise. Try again.');
  refresh(slug);
  return { message: intent === 'complete' ? 'Exercise completed.' : 'Draft saved.' };
}

export async function saveCheckIn(slot: string, day: string, previous: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return unavailable();
  const { client, user } = await account(true);
  const quickMood = formValue(form, 'mood');
  const emotions = parseEmotionField(form.get('emotions'));
  if (!emotions.success) return failure('Choose up to 12 distinct emotions.');
  const mood = emotions.data.length ? (emotions.data.length === 1 && moods.includes(emotions.data[0]) ? emotions.data[0] : 'Mixed') : quickMood;
  const note = formValue(form, 'note');
  if (day !== growthDates(await growthTimezone(client, user.id)).today) return failure('The day has changed. Reload to check in for today.');
  if (!checkIns.some(item => item.key === slot) || !moods.includes(mood) || note.length > 2000) {
    return failure('Choose a mood and keep your note under 2,000 characters.');
  }
  const { error } = await client.from('growth_check_ins')
    .upsert({ user_id: user.id, local_date: day, slot, mood, note, emotion_labels: emotions.data }, { onConflict: 'user_id,local_date,slot' });
  if (error) return failure('Could not save your check-in. Try again.');
  refresh('mood-tracker');
  return { message: 'Check-in saved.' };
}

export async function saveWeekly(week: string, previous: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return unavailable();
  const { client, user } = await account(true);
  if (week !== growthDates(await growthTimezone(client, user.id)).monday) return failure('The week has changed. Reload to reflect on the new week.');
  const answers = readAnswers(reflection.fields, form);
  if (!answers || !Object.values(answers).some(Boolean)) return failure('Write at least one response before saving.');
  const revision = formValue(form, 'revision');
  const table = client.from('growth_weekly_reflections');
  const fields = { answers, updated_at: new Date().toISOString() };
  const result = revision
    ? await table.update(fields).eq('user_id', user.id).eq('week_start', week).eq('updated_at', revision).select('week_start').maybeSingle()
    : await table.insert({ ...fields, user_id: user.id, week_start: week }).select('week_start').single();
  if (result.error?.code === '23505' || !result.error && !result.data) return conflict();
  if (result.error) return failure('Could not save your reflection. Try again.');
  refresh();
  return { message: 'Reflection saved.' };
}

export async function createHabit(previous: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return unavailable();
  const { client, user } = await account(true);
  const title = formValue(form, 'title');
  if (!title || title.length > 80) return failure('Enter a habit name up to 80 characters.');
  const source = formValue(form, 'source') === 'future' ? 'future' : '';
  const { error } = await client.from('growth_habits').insert({ title, user_id: user.id, source });
  if (error) return failure('Could not add your habit. Try again.');
  refresh('habit-tracker');
  return { message: 'Habit added.' };
}

export async function setHabit(id: string, date: string, checked: boolean): Promise<void> {
  if (demo || !z.uuid().safeParse(id).success || !z.iso.date().safeParse(date).success) return;
  const { client, user } = await account(true);
  const { today } = growthDates(await growthTimezone(client, user.id));
  if (date > today) throw new Error('This habit date is in the future.');
  const table = client.from('growth_habit_logs');
  const { error } = checked
    ? await table.upsert({ habit_id: id, local_date: date, user_id: user.id, state: 'Completed', amount: null }, { onConflict: 'habit_id,local_date' })
    : await table.delete().eq('habit_id', id).eq('local_date', date).eq('user_id', user.id);
  if (error) throw new Error('Could not update your habit.');
  refresh('habit-tracker');
}

export async function saveGrowthTimezone(previous: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return unavailable();
  const { client, user } = await account(true);
  const timezone = formValue(form, 'timezone');
  if (!growthTimezones.includes(timezone)) return failure('Choose a timezone from the list.');
  const result = await client.from('profiles').update({ growth_timezone: timezone })
    .eq('id', user.id).select('id').single();
  if (result.error || !result.data) return failure('Could not save your timezone. Try again.');
  revalidatePath('/becoming', 'layout');
  return { message: 'Timezone saved.' };
}
