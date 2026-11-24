import { z } from 'zod';
import { emotionList } from './emotions';

export const moodPath = '/becoming/mood-tracker';
export const moodSlots = ['morning', 'midday', 'afternoon', 'evening'] as const;
export const slotNames = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', evening: 'Evening' } as const;
export const contextTags = ['Work','School','Family','Friends','Solitude','Exercise','Dance','Creativity','Community','Rest','Finances','Relationships'];
export const detailScales = { intensity: 'Emotional intensity', stress: 'Stress level', sleep: 'Sleep quality',
  belonging: 'Perceived belonging', authenticity: 'Ability to express authentic self' } as const;
export const detailNotes = { sensations: 'Physical sensations', activity: 'Current activity', social: 'Social context',
  environment: 'Environmental stressors', needs: 'Relevant personal needs', journal: 'Journal entry' } as const;

const keys = <T extends object>(value: T) => Object.keys(value) as (keyof T & string)[];
const scale = z.number().int().min(1).max(10);
export const moodInput = z.object({
  rating: scale.nullable(), energy: scale.nullable(), emotions: emotionList, note: z.string().trim().max(2000),
  scales: z.partialRecord(z.enum(keys(detailScales)), scale),
  details: z.partialRecord(z.enum(keys(detailNotes)), z.string().trim().max(2000)),
  tags: z.array(z.string().trim().min(1).max(40)).max(20)
    .refine(items => new Set(items.map(item => item.toLowerCase())).size === items.length),
});
export type MoodInput = z.infer<typeof moodInput>;
export const emptyMood: MoodInput = { rating: null, energy: null, emotions: [], note: '', scales: {}, details: {}, tags: [] };

const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
export const moodSettingsSchema = z.object({
  times: z.object({ morning: time.nullable(), midday: time.nullable(), afternoon: time.nullable(), evening: time.nullable() }),
  days: z.array(z.number().int().min(1).max(7)).max(7).refine(items => new Set(items).size === items.length),
  reminders: z.boolean(),
  quietStart: time.nullable(), quietEnd: time.nullable(),
}).refine(value => (!value.quietStart && !value.quietEnd) || (Boolean(value.quietStart && value.quietEnd) && value.quietStart !== value.quietEnd));
export type MoodSettings = z.infer<typeof moodSettingsSchema>;
export const defaultMoodSettings: MoodSettings = {
  times: { morning: '08:00', midday: '12:00', afternoon: '16:00', evening: '20:00' },
  days: [1,2,3,4,5,6,7], reminders: false, quietStart: null, quietEnd: null,
};

export type MoodRecord = MoodInput & {
  id: string; revision: string; occurredAt: string | null; day: string; timezone: string; slot: typeof moodSlots[number] | 'daily' | null; legacy: string | null;
};
export function average(values: (number | null)[]) {
  const present = values.filter((value): value is number => value !== null);
  return { value: present.length ? Math.round(present.reduce((sum, current) => sum + current, 0) / present.length * 10) / 10 : null,
    count: present.length };
}

export function isQuiet(localTime: string, start: string | null, end: string | null) {
  if (!start || !end) return false;
  return start < end ? localTime >= start && localTime < end : localTime >= start || localTime < end;
}

export function dueMoodSlots(settings: MoodSettings, localTime: string, weekday: number, recorded: (MoodRecord['slot'])[]) {
  if (!settings.reminders || !settings.days.includes(weekday) || isQuiet(localTime, settings.quietStart, settings.quietEnd)) return [];
  return moodSlots.filter(slot => {
    const time = settings.times[slot];
    return time && localTime >= time && !recorded.includes(slot);
  });
}
