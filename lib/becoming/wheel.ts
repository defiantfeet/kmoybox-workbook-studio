import { z } from 'zod';

export const defaultDomains = [
  ['career', 'Career and education'], ['finance', 'Financial wellbeing'],
  ['physical', 'Physical wellbeing'], ['relationships', 'Relationships and social connection'],
  ['growth', 'Personal growth'], ['recreation', 'Recreation and creativity'],
  ['environment', 'Living environment'], ['purpose', 'Meaning and purpose'],
] as const;

const legacyDomains = [
  ['legacy-wellbeing', 'Wellbeing'], ['career', 'Work or study'], ['finance', 'Finances'],
  ['relationships', 'Relationships'], ['legacy-community', 'Community'], ['recreation', 'Rest and play'],
  ['growth', 'Personal growth'], ['environment', 'Home environment'],
] as const;

const domainSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,48}$/),
  label: z.string().trim().min(1).max(80),
  rating: z.number().int().min(1).max(10).nullable(),
  note: z.string().trim().max(2000),
  priority: z.boolean(),
}).strict();

export const maxDomains = 12;
export const wheelSchema = z.object({ domains: z.array(domainSchema).min(1).max(maxDomains), reflection: z.string().max(2000).optional() }).strict()
  .refine(({ domains }) => new Set(domains.map(domain => domain.id)).size === domains.length
    && new Set(domains.map(domain => domain.label.toLowerCase())).size === domains.length);

export type Domain = z.infer<typeof domainSchema>;
export type Assessment = { id: string; completed_at: string; domains: Domain[]; reflection?: string };

export function emptyDomains() {
  return defaultDomains.map(([id, label]) => ({ id, label, rating: null, note: '', priority: false }));
}

export function readWheelAnswers(answers: unknown): { domains: Domain[]; reflection?: string } {
  const parsed = wheelSchema.safeParse(answers);
  if (parsed.success) return parsed.data;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return { domains: emptyDomains() };
  const legacy = answers as Record<string, unknown>;
  return {
    domains: legacyDomains.map(([id, label], index) => ({
      id, label, rating: typeof legacy[index] === 'string' && /^(?:[1-9]|10)$/.test(legacy[index]) ? Number(legacy[index]) : null,
      note: '', priority: false,
    })),
    reflection: typeof legacy[8] === 'string' ? legacy[8] : undefined,
  };
}

export function localWheelDate(timestamp: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(timestamp));
}

export function nextWheelReminder(enabledSince: string | null, latest: string | undefined, timezone: string) {
  if (!enabledSince) return null;
  const lastDay = latest ? localWheelDate(latest, timezone) : enabledSince;
  const anchor = lastDay > enabledSince ? lastDay : enabledSince;
  const date = new Date(anchor + 'T00:00:00Z');
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, daysInMonth));
  return date.toISOString().slice(0, 10);
}

export function wheelTrends(assessments: Assessment[], timezone: string, period: 'month' | 'quarter') {
  const buckets = new Map<string, Map<string, { label: string; sum: number; count: number }>>();
  for (const assessment of assessments) {
    const month = localWheelDate(assessment.completed_at, timezone).slice(0, 7);
    const key = period === 'month' ? month : month.slice(0, 4) + ' Q' + Math.ceil(Number(month.slice(5)) / 3);
    const bucket = buckets.get(key) ?? new Map();
    for (const domain of assessment.domains) {
      if (domain.rating === null) continue;
      const identity = domain.id + '/' + domain.label.toLowerCase();
      const entry = bucket.get(identity) ?? { label: domain.label, sum: 0, count: 0 };
      entry.sum += domain.rating;
      entry.count++;
      bucket.set(identity, entry);
    }
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].map(([period, bucket]) => ({
    period, entries: [...bucket.values()].map(({ label, sum, count }) => ({ label, average: (sum / count).toFixed(1), count })),
  }));
}
