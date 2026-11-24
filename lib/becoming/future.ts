import { z } from 'zod';

export const futurePath = '/becoming/future-self-visualization';
export const horizons = ['30 days', '90 days', '6 months', '1 year', '3 years', '5 years', 'Custom date'] as const;
export const futureSections = {
  identity: 'Personal identity', emotions: 'Emotional wellbeing', relationships: 'Relationships',
  career: 'Career and education', finances: 'Financial intentions', physical: 'Physical wellbeing',
  creativity: 'Creativity', community: 'Community contribution', lifestyle: 'Lifestyle', purpose: 'Meaning and purpose',
} as const;

export const futurePrompts = {
  becoming: 'Who am I becoming?',
  values: 'What values guide my future self?',
  day: 'What does an ordinary day look like?',
  relationships: 'What relationships surround me?',
  society: 'How do I participate in society?',
  habits: 'What habits support this life?',
  obstacles: 'What obstacles might I encounter?',
  support: 'What resources or support would help?',
  action: 'What is one realistic action I can take now?',
} as const;

export type Horizon = typeof horizons[number];
export type FutureFields = {
  horizon: Horizon; customDate: string; reflectionDate: string;
  sections: Partial<Record<keyof typeof futureSections, string>>;
  prompts: Partial<Record<keyof typeof futurePrompts, string>>;
  letter: string; board: string[];
};
const date = z.union([z.literal(''), z.iso.date()]);
const note = z.string().trim().max(2000);
const keys = <T extends object>(value: T) => Object.keys(value) as [keyof T & string, ...(keyof T & string)[]];
export const futureFields = z.object({
  horizon: z.enum(horizons), customDate: date, reflectionDate: date,
  sections: z.partialRecord(z.enum(keys(futureSections)), note),
  prompts: z.partialRecord(z.enum(keys(futurePrompts)), note),
  letter: z.string().trim().max(8000),
  board: z.array(z.string().trim().max(300)).max(8).transform(items => items.filter(Boolean)),
}).refine(value => value.horizon === 'Custom date' ? Boolean(value.customDate) : !value.customDate);

export const futureSchema = z.intersection(futureFields, z.object({
  format: z.literal('future-v1'), origin: z.iso.date(), target: z.iso.date(),
})).refine(value => value.target >= value.origin && (!value.reflectionDate || value.reflectionDate >= value.origin));

export const emptyFuture: FutureFields = {
  horizon: '90 days', customDate: '', reflectionDate: '', sections: {}, prompts: {}, letter: '', board: [],
};

export type FutureEntry = z.infer<typeof futureSchema>;
export type FutureSnapshot = { id: string; revision: string; completedAt: string; entry: FutureEntry };
export function readFuture(value: unknown) {
  const result = futureSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function horizonDate(origin: string, horizon: Horizon, custom: string) {
  if (horizon === 'Custom date') return custom;
  const date = new Date(origin + 'T00:00:00Z');
  if (horizon === '30 days' || horizon === '90 days') {
    date.setUTCDate(date.getUTCDate() + (horizon === '30 days' ? 30 : 90));
  } else {
    const months = { '6 months': 6, '1 year': 12, '3 years': 36, '5 years': 60 };
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months[horizon]);
    const end = new Date(date);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(day, end.getUTCDate()));
  }
  return date.toISOString().slice(0, 10);
}
