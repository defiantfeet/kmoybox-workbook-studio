import { z } from 'zod';
import { emotionList } from './emotions';
import type { ThoughtEntry } from './thought-record';

export const reframeFields = {
  thought: 'Thought or belief', situation: 'Surrounding situation',
  observations: 'What did you directly observe?', interpretations: 'What meaning did you give those observations?',
  supporting: 'Evidence that supports the thought', conflicting: 'Evidence that may conflict with the thought',
  alternatives: 'Alternative explanations', within: 'What can you influence or choose?',
  outside: 'What is outside your control?', balanced: 'Balanced alternative perspective',
  next: 'A realistic next action', change: 'What changed or stayed the same in how you feel?',
} as const;

export const reframeSteps = [
  'Name the thought and context', 'Separate observations and interpretations',
  'Weigh the evidence and alternatives', 'Consider what you can influence',
  'Review your perspective and feelings',
];

export const perspectivePrompts = [
  'What would I say to a friend?',
  'What information might I be missing?',
  'Am I treating a possibility as a certainty?',
  'Is this thought helping me act according to my values?',
  'Could the environment, rather than my thinking, be the primary problem?',
];

export type ReframeField = keyof typeof reframeFields;
const rating = z.number().int().min(0).max(100).nullable();
export const reframeSchema = z.object({
  format: z.literal('reframe-v1'), stage: z.number().int().min(1).max(reframeSteps.length),
  beforeEmotions: emotionList, afterEmotions: emotionList, before: rating, after: rating,
  text: z.partialRecord(z.enum(Object.keys(reframeFields) as ReframeField[]), z.string().trim().max(2000)),
}).strict();
export type ReframeEntry = z.infer<typeof reframeSchema>;
export type ReframeSnapshot = { id: string; completedAt: string; entry: ReframeEntry };
export type ThoughtImportOption = { id: string; savedAt: string; draft: boolean };

export const emptyReframe: ReframeEntry = {
  format: 'reframe-v1', stage: 1, beforeEmotions: [], afterEmotions: [], before: null, after: null, text: {},
};

export function readReframe(input: unknown): ReframeEntry {
  const parsed = reframeSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return emptyReframe;
  const legacy = input as Record<string, unknown>;
  const emotions = emotionList.safeParse(legacy.emotions);
  const text = (key: string) => typeof legacy[key] === 'string' ? legacy[key] : '';
  return { ...emptyReframe, beforeEmotions: emotions.data ?? [],
    text: { thought: text('0'), alternatives: text('1'), balanced: text('2') } };
}

export function thoughtToReframe(thought: ThoughtEntry): ReframeEntry {
  return {
    ...emptyReframe,
    beforeEmotions: thought.emotions, before: thought.before, after: thought.after,
    text: {
      thought: thought.text.automatic, situation: thought.text.situation,
      supporting: thought.text.supporting, conflicting: thought.text.otherEvidence,
      alternatives: thought.text.alternative, balanced: thought.text.balanced, next: thought.text.action,
    },
  };
}

export function fillReframeBlanks(current: ReframeEntry, imported: ReframeEntry): ReframeEntry {
  const text = { ...current.text };
  for (const key of Object.keys(reframeFields) as ReframeField[]) {
    if (!text[key]?.trim() && imported.text[key]?.trim()) text[key] = imported.text[key];
  }
  return { ...current, text,
    beforeEmotions: current.beforeEmotions.length ? current.beforeEmotions : imported.beforeEmotions,
    afterEmotions: current.afterEmotions.length ? current.afterEmotions : imported.afterEmotions,
    before: current.before ?? imported.before, after: current.after ?? imported.after,
  };
}
