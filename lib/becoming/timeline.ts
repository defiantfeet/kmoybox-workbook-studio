import { z } from 'zod';
import { emotionList } from './emotions';

export const timelinePath = '/becoming/life-timeline';
export const timelineCategories = ['Family', 'Education', 'Relationships', 'Career', 'Personal achievements',
  'Identity development', 'Loss and change', 'Creativity', 'Community', 'Major transitions', 'Personal discoveries'] as const;
export const timelineTones = ['Supportive', 'Challenging', 'Mixed', 'Uncertain'] as const;
export const timelineFields = {
  description: 'Description', meaning: 'Personal meaning', lessons: 'Lessons learned',
  values: 'Values associated with the event', identity: 'Influence on current identity',
} as const;
export const timingLabels = { exact: 'Exact date', approximate: 'Approximate date', age: 'Age range', chapter: 'Undated chapter' } as const;

const year = z.string().regex(/^[1-9][0-9]{3}$/);
const short = z.string().trim().max(120);
const noteKeys = Object.keys(timelineFields) as (keyof typeof timelineFields)[];
const age = z.number().int().min(0).max(150);
const timing = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('exact'), date: z.iso.date().refine(value => value >= '0001-01-01') }),
  z.object({ mode: z.literal('approximate'), year, month: z.union([z.literal(''), z.string().regex(/^(0[1-9]|1[0-2])$/)]) }),
  z.object({ mode: z.literal('age'), start: age, end: age }).refine(value => value.end >= value.start),
  z.object({ mode: z.literal('chapter'), label: short }),
]);

export const timelineSchema = z.object({
  format: z.literal('timeline-v1'),
  title: short.min(1),
  timing,
  category: z.union([z.literal(''), z.enum(timelineCategories)]),
  tone: z.union([z.literal(''), z.enum(timelineTones)]),
  notes: z.partialRecord(z.enum(noteKeys), z.string().trim().max(2000)),
  emotions: emotionList,
  future: z.boolean(),
  hidden: z.boolean(),
});

export type TimelineEntry = z.infer<typeof timelineSchema>;
export type TimelineWhen = TimelineEntry['timing'];
export type TimelineRecord = { id: string; revision: string; createdAt: string; event: TimelineEntry; image: boolean };
export const emptyTimeline: TimelineEntry = {
  format: 'timeline-v1', title: '', timing: { mode: 'chapter', label: '' }, category: '', tone: '',
  notes: {}, emotions: [], future: false, hidden: false,
};

export function readTimeline(input: unknown) {
  const result = timelineSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function timingLabel(value: TimelineWhen) {
  const format = (day: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...options }).format(new Date(day + 'T00:00:00Z'));
  switch (value.mode) {
    case 'exact': return format(value.date, { dateStyle: 'long' });
    case 'approximate': return 'Around ' + (value.month
      ? format(value.year + '-' + value.month + '-01', { month: 'long', year: 'numeric' }) : value.year);
    case 'age': return value.start === value.end ? 'Age ' + value.start : 'Ages ' + value.start + '–' + value.end;
    case 'chapter': return value.label || 'Undated chapter';
  }
}

export function timelineOrder(a: TimelineRecord, b: TimelineRecord) {
  const key = (value: TimelineRecord) => {
    const time = value.event.timing;
    switch (time.mode) {
      case 'exact': return '0:' + time.date;
      case 'approximate': return '0:' + time.year + '-' + (time.month || '00') + '-00';
      case 'age': return '1:' + String(time.start).padStart(3, '0') + ':' + String(time.end).padStart(3, '0');
      case 'chapter': return '2:' + value.createdAt;
    }
  };
  return key(a).localeCompare(key(b)) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export const timelineImageLimit = 512 * 1024;
