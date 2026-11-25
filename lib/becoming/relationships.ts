import { z } from 'zod';
import { emotionList } from './emotions';

export const relationshipCategories = ['Family', 'Friends', 'Romantic relationships', 'Coworkers', 'Mentors',
  'Acquaintances', 'Community connections', 'Professional networks'] as const;

export const closenessRings = ['Inner circle', 'Middle circle', 'Outer circle'] as const;

export const relationshipRatings = ['Emotional safety', 'Trust', 'Reciprocity', 'Communication', 'Respect',
  'Autonomy', 'Shared interests', 'Reliability', 'Sense of belonging', 'Ability to be authentic'] as const;

export const relationshipPrompts = {
  beforeAfter: 'How do I feel before and after interacting?',
  disagreement: 'Can I express disagreement?',
  pressure: 'Do I feel pressure to change who I am?',
  contribution: 'What do I contribute to this relationship?',
  improvement: 'What would I like to improve?',
  boundaries: 'What boundaries might be helpful?',
} as const;

const note = z.string().trim().max(2000);
export const relationshipDetails = z.object({
  label: z.string().trim().min(1).max(80),
  category: z.union([z.literal(''), z.enum(relationshipCategories)]),
  ring: z.union([z.literal(''), z.enum(closenessRings)]),
  ratings: z.partialRecord(z.enum(relationshipRatings), z.number().int().min(1).max(5)),
  reflections: z.partialRecord(z.enum(Object.keys(relationshipPrompts) as (keyof typeof relationshipPrompts)[]), note),
  emotions: emotionList,
  intention: note,
});

export const relationshipSchema = relationshipDetails.extend({
  format: z.literal('relationship-v1'),
  reviews: z.array(z.object({ date: z.iso.date(), intention: note.min(1), note: note.min(1) })).max(100),
});

export type RelationshipDetails = z.infer<typeof relationshipDetails>;
export type Relationship = z.infer<typeof relationshipSchema>;
export const emptyRelationship: RelationshipDetails = {
  label: '', category: '', ring: '', ratings: {}, reflections: {}, emotions: [], intention: '',
};

export function readRelationship(input: unknown): Relationship | null {
  const result = relationshipSchema.safeParse(input);
  return result.success ? result.data : null;
}
