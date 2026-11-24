import { z } from 'zod';

export const habitPath = '/becoming/habit-tracker';
export const habitCategories = ['Personal growth', 'Emotional wellbeing', 'Physical movement', 'Education', 'Creativity',
  'Social connection', 'Community participation', 'Professional development', 'Rest and recovery', 'Daily routines'] as const;
export const habitTemplates = [
  ['Pause to reflect', 'Personal growth'], ['Take a gentle movement break', 'Physical movement'],
  ['Read a page', 'Education'], ['Make something for a few minutes', 'Creativity'],
  ['Check in with someone', 'Social connection'], ['Make space for rest', 'Rest and recovery'],
] as const;
export const habitStates = ['Completed', 'Partially completed', 'Rest day', 'Skipped', 'Not recorded'] as const;
export const completionTypes = ['Check-off', 'Count', 'Minutes'] as const;
export const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
export const scheduleModes = ['daily', 'weekly', 'selected', 'custom'] as const;
export const scheduleNames = { daily: 'Daily', weekly: 'Weekly', selected: 'Selected days', custom: 'Custom interval' } as const;

export const scheduleSchema = z.object({
  mode: z.enum(scheduleModes), days: z.array(z.number().int().min(1).max(7)).max(7),
  every: z.number().int().min(1).max(365),
}).refine(({ mode, days }) => new Set(days).size === days.length &&
  (mode === 'weekly' ? days.length === 1 : mode === 'selected' ? days.length > 0 : days.length === 0));

export const habitSchema = z.object({
  title: z.string().trim().min(1).max(80), category: z.union([z.literal(''), z.enum(habitCategories)]),
  motivation: z.string().trim().max(2000), core_value: z.string().trim().max(100), notes: z.string().trim().max(2000),
  started_on: z.iso.date(), ends_on: z.iso.date().nullable(), preferred_time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).nullable(),
  reminder: z.boolean(), completion_type: z.enum(completionTypes), schedule: scheduleSchema, goal_id: z.uuid().nullable(),
  source: z.enum(['', 'future', 'social']),
}).refine(entry => !entry.ends_on || entry.ends_on >= entry.started_on)
  .refine(entry => !entry.reminder || Boolean(entry.preferred_time));

export type Schedule = z.infer<typeof scheduleSchema>;
export type HabitFields = z.infer<typeof habitSchema>;
export type Habit = HabitFields & { id: string; updated_at: string; archived_on: string | null; paused: boolean;
  schedule_history: { day: string; start: string; end: string | null; schedule: Schedule; paused: boolean }[] };
export type HabitLog = { habit_id: string; local_date: string; state: Exclude<typeof habitStates[number], 'Not recorded'>; amount: number | null };
export const dailySchedule: Schedule = { mode: 'daily', days: [], every: 1 };

export function addDays(day: string, offset: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function habitRange(day: string, view: string) {
  const date = new Date(day + 'T00:00:00Z');
  if (view === 'week') {
    const start = addDays(day, -((date.getUTCDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { start: day.slice(0, 7) + '-01', end: date.toISOString().slice(0, 10) };
}

export function dateRange(start: string, end: string) {
  const dates: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day);
  return dates;
}

export function isScheduled(habit: Habit, day: string) {
  if (habit.archived_on && habit.archived_on < day) return false;
  const current = habit.schedule_history.filter(item => item.day <= day).at(-1);
  if (!current && habit.schedule_history.length) return false;
  const { start, end, schedule, paused } = current ?? {
    start: habit.started_on, end: habit.ends_on, schedule: habit.schedule, paused: habit.paused,
  };
  if (paused || day < start || (end && day > end)) return false;
  const date = new Date(day + 'T00:00:00Z');
  if (schedule.mode === 'daily') return true;
  if (schedule.mode === 'custom') return ((date.valueOf() - Date.parse(start + 'T00:00:00Z')) / 86400000) % schedule.every === 0;
  return schedule.days.includes(date.getUTCDay() || 7);
}

export function adherence(habit: Habit, dates: string[], today: string, logs: ReadonlyMap<string, HabitLog>) {
  let opportunities = 0;
  let completed = 0;
  let partial = 0;
  for (const day of dates) {
    const state = logs.get(day)?.state;
    if (day > today || state === 'Rest day' || (!state && !isScheduled(habit, day))) continue;
    opportunities++;
    if (state === 'Completed') completed++;
    if (state === 'Partially completed') partial++;
  }
  return { opportunities, completed, partial, percent: opportunities ? Math.round(completed * 100 / opportunities) : null };
}
