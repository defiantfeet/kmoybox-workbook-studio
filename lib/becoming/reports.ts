import { z } from 'zod';
import { addDays } from './habits';

export const reportsPath = '/becoming/reports';
export const reportKinds = ['weekly', 'monthly'] as const;
export const reportLabels = { weekly: 'Weekly Growth Report', monthly: 'Monthly Growth Report' } as const;
export const reportCategories = {
  activity: 'Reflection activity',
  emotions: 'Emotional check-ins',
  habits: 'Habit consistency',
  goals: 'Personal goal progress',
  values: 'Values-related activities',
  social: 'Social participation',
  belonging: 'Perceived belonging',
  relationships: 'Relationship reflections',
  intentions: 'Upcoming intentions',
  guided: 'Your guided reflections',
} as const;
export const reportQuestions = {
  learning: 'What did I learn about myself?',
  challenge: 'What challenged me?',
  belonging: 'Where did I experience belonging?',
  authenticity: 'Where did I remain authentic?',
  wellbeing: 'What supported my wellbeing?',
  change: 'What would I like to change?',
  support: 'What support might I need?',
  intention: 'What is my intention for the next period?',
} as const;

export const reportKeys = Object.keys(reportCategories) as (keyof typeof reportCategories)[];
export const reportDataKeys = reportKeys.filter((key): key is Exclude<ReportCategory, 'guided'> => key !== 'guided');
const questionKeys = Object.keys(reportQuestions) as (keyof typeof reportQuestions)[];
export type ReportCategory = typeof reportKeys[number];
export type ReportKind = typeof reportKinds[number];
export type ReportPeriod = { start: string; end: string };

export function reportPeriod(kind: ReportKind, day: string): ReportPeriod {
  const date = new Date(day + 'T00:00:00Z');
  if (kind === 'weekly') {
    const start = addDays(day, -((date.getUTCDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { start: day.slice(0, 7) + '-01', end: date.toISOString().slice(0, 10) };
}

const metric = z.object({ label: z.string().max(160), value: z.number().finite(), sample: z.number().int().nonnegative().optional(), unit: z.string().max(40).optional() });
const line = z.object({ text: z.string().max(200), day: z.iso.date().optional() });
export const reportSnapshot = z.partialRecord(z.enum(reportDataKeys), z.object({
  metrics: z.array(metric).max(40), lines: z.array(line).max(25),
}));
export const reportResponses = z.partialRecord(z.enum(questionKeys), z.string().trim().max(2000));
export const reportSelections = z.array(z.enum(reportKeys)).max(reportKeys.length).refine(items => new Set(items).size === items.length);
export type ReportSnapshot = z.infer<typeof reportSnapshot>;
export type ReportResponses = z.infer<typeof reportResponses>;
export type ReportSection = NonNullable<ReportSnapshot[typeof reportDataKeys[number]]>;
export type ReportMetric = z.infer<typeof metric>;
export type SavedReport = {
  id: string; kind: ReportKind; start: string; end: string; timezone: string; through: string; revision: string;
  categories: ReportCategory[]; reflections: ReportResponses; snapshot: ReportSnapshot;
};

export function metricLabel(item: ReportMetric) {
  return String(item.value) + (item.unit ? ' ' + item.unit : '') + (item.sample === undefined ? '' : ' (n = ' + item.sample + ')');
}

export const reportDateLabel = (day: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })
  .format(new Date(day + 'T00:00:00Z'));
