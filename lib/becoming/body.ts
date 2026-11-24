import { z } from 'zod';
import { emotionList } from './emotions';

export const bodyPath = '/becoming/body-awareness-map';
export const bodyRegions = ['Head', 'Jaw', 'Neck', 'Shoulders', 'Chest', 'Upper back', 'Lower back',
  'Abdomen', 'Arms', 'Hands', 'Hips', 'Legs', 'Feet'] as const;
export type BodyRegion = typeof bodyRegions[number];
export const sensations = ['Tension', 'Warmth', 'Coldness', 'Heaviness', 'Lightness', 'Tingling',
  'Relaxation', 'Numbness', 'Discomfort'] as const;

const note = z.string().trim().max(2000);
const observation = z.object({
  region: z.enum(bodyRegions),
  sensation: z.union([z.literal(''), z.enum(sensations), z.literal('Custom')]),
  custom: z.string().trim().max(80),
  intensity: z.number().int().min(0).max(10).nullable(),
  emotions: emotionList,
  context: note,
  activity: note,
  reflection: note,
}).refine(value => value.sensation === 'Custom' ? Boolean(value.custom) : !value.custom);

export const bodySchema = z.object({
  format: z.literal('body-v1'),
  observations: z.array(observation).max(bodyRegions.length)
    .refine(items => new Set(items.map(item => item.region)).size === items.length),
  movement: z.object({ activity: note, before: note, after: note }),
}).refine(value => value.observations.length > 0 || Object.values(value.movement).some(Boolean));

export type BodyObservation = z.infer<typeof observation>;
export type BodyEntry = z.infer<typeof bodySchema>;
export type BodySnapshot = { id: string; completedAt: string; entry: BodyEntry };

export const emptyMovement: BodyEntry['movement'] = { activity: '', before: '', after: '' };

export function emptyObservation(region: BodyRegion): BodyObservation {
  return { region, sensation: '', custom: '', intensity: null, emotions: [], context: '', activity: '', reflection: '' };
}

export function readBody(input: unknown) {
  const parsed = bodySchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
