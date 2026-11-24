import { z } from 'zod';
import { addDays, habitRange } from './habits';

export const remindersPath = '/becoming/notifications';
export const reminderTypes = {
  morning: ['Morning mood check-in', '/becoming/mood-tracker?slot=morning#mood-editor'],
  midday: ['Midday mood check-in', '/becoming/mood-tracker?slot=midday#mood-editor'],
  afternoon: ['Afternoon mood check-in', '/becoming/mood-tracker?slot=afternoon#mood-editor'],
  evening: ['Evening mood check-in', '/becoming/mood-tracker?slot=evening#mood-editor'],
  habits: ['Habit activities', '/becoming/habit-tracker'],
  goals: ['Personal goals', '/goals'],
  social: ['Social intentions', '/becoming/social-integration?section=goals'],
  weekly: ['Weekly reflections', '/becoming#growth-weekly'],
  wheel: ['Wheel of Life assessments', '/becoming/wheel-of-life'],
  future: ['Future-self letters', '/becoming/future-self-visualization'],
  boundary: ['Boundary follow-ups', '/becoming/boundary-builder'],
  weeklyReport: ['Weekly Growth Reports', '/becoming/reports?kind=weekly'],
  monthlyReport: ['Monthly Growth Reports', '/becoming/reports?kind=monthly'],
} as const;
export type ReminderType = keyof typeof reminderTypes;
export const reminderKeys = Object.keys(reminderTypes) as ReminderType[];
export const frequencies = ['due', 'daily', 'weekly', 'monthly'] as const;
export const reminderChannels = ['app', 'browser', 'both'] as const;
const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const rule = z.object({ enabled: z.boolean(), frequency: z.enum(frequencies), time,
  weekday: z.number().int().min(1).max(7), monthDay: z.number().int().min(1).max(28), channel: z.enum(reminderChannels) });
export const reminderSettingsSchema = z.object({
  enabled: z.boolean(), quietStart: time.nullable(), quietEnd: time.nullable(),
  rules: z.record(z.enum(reminderKeys), rule),
}).refine(value => (value.quietStart === null && value.quietEnd === null) ||
  (value.quietStart !== null && value.quietEnd !== null && value.quietStart !== value.quietEnd));
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;
export type ReminderRule = z.infer<typeof rule>;

export function defaultReminderSettings(): ReminderSettings {
  const scheduled = { morning: '08:00', midday: '12:00', afternoon: '16:00', evening: '20:00' } as const;
  const rules = Object.fromEntries(reminderKeys.map(key => {
    const frequency = key in scheduled ? 'daily' : key === 'weekly' ? 'weekly' : key === 'wheel' ? 'monthly' : 'due';
    return [key, { enabled: false, frequency, time: scheduled[key as keyof typeof scheduled] ?? '09:00', weekday: 7, monthDay: 1, channel: 'app' }];
  })) as ReminderSettings['rules'];
  return { enabled: true, quietStart: null, quietEnd: null, rules };
}

export const reminderMessage = 'Take a moment for yourself.';
export type ReminderNotice = { id: string; type: ReminderType; occurrence: string };

export function reminderClock(now: Date, timezone: string) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay() || 7;
  return { day, time, weekday, monday: habitRange(day, 'week').start };
}

export function recurrenceKey(rule: ReminderRule, clock: ReturnType<typeof reminderClock>, due: string | null) {
  if (!rule.enabled || clock.time < rule.time || due === null) return null;
  switch (rule.frequency) {
    case 'due': return due;
    case 'daily': return clock.day;
    case 'weekly': return clock.weekday >= rule.weekday ? clock.monday : null;
    case 'monthly': return Number(clock.day.slice(-2)) >= rule.monthDay ? clock.day.slice(0, 7) + '-01' : null;
  }
}

export function previousReminderPeriod(type: 'weeklyReport' | 'monthlyReport', day: string) {
  const start = type === 'weeklyReport' ? habitRange(day, 'week').start : day.slice(0, 7) + '-01';
  const previous = addDays(start, -1);
  return type === 'weeklyReport' ? habitRange(previous, 'week').start : previous.slice(0, 7) + '-01';
}
