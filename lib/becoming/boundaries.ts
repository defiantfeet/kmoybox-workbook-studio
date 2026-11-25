import { z } from 'zod';

export const boundaryCategories = ['Physical', 'Emotional', 'Time', 'Financial', 'Digital', 'Professional', 'Family', 'Romantic', 'Social', 'Personal privacy'] as const;
export const boundaryZones = ['Comfortable', 'Conditional or negotiable', 'Not acceptable'] as const;
export const boundaryTemplates = ['I feel…', 'I need…', 'I am comfortable with…', 'I am not available for…', 'I would prefer…', 'If this continues, I will…'] as const;

export const boundaryFields = {
  situation: 'Situation or relationship', need: 'Personal need', value: 'Relevant core value',
  current: 'Current boundary', desired: 'Desired boundary', preference: 'Communication preference',
  action: 'Action within my control', obstacles: 'Potential obstacles', followUp: 'Follow-up reflection',
} as const;
export type BoundaryField = keyof typeof boundaryFields;

const note = z.string().trim().max(2000);
export const boundarySchema = z.object({
  format: z.literal('boundary-v1'),
  category: z.union([z.enum(boundaryCategories), z.literal('')]),
  zone: z.union([z.enum(boundaryZones), z.literal('')]),
  safety: z.enum(['', 'safe', 'uncertain', 'unsafe']),
  notes: z.partialRecord(z.enum(Object.keys(boundaryFields) as BoundaryField[]), note),
  script: note,
  followUpDate: z.union([z.iso.date(), z.literal('')]),
  relationshipId: z.union([z.uuid(), z.literal('')]),
}).strict();

export type BoundaryEntry = z.infer<typeof boundarySchema>;
export type BoundaryRecord = { id: string; revision: string; savedAt: string | null; entry: BoundaryEntry };
export type BoundaryJournal = { id: string; occurred_on: string; practice: string; reflection: string };
export type RelationshipOption = { id: string; savedAt: string; draft: boolean; label: string };
export const emptyBoundary: BoundaryEntry = {
  format: 'boundary-v1', category: '', zone: '', safety: '', notes: {}, script: '', followUpDate: '', relationshipId: '',
};

export function readBoundary(input: unknown): BoundaryEntry {
  const parsed = boundarySchema.safeParse(input);
  if (parsed.success) return parsed.data;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return emptyBoundary;
  const legacy = input as Record<string, unknown>;
  const note = (key: string) => typeof legacy[key] === 'string' ? legacy[key] : '';
  return { ...emptyBoundary, notes: { situation: note('0'), action: note('1') }, script: note('2') };
}

export function privatePlanning(entry: Pick<BoundaryEntry, 'safety'>) {
  return entry.safety === 'unsafe' || entry.safety === 'uncertain';
}
