import { z } from 'zod';
import { emotionList } from './emotions';
import { moods } from './catalog';

export const thoughtTextFields = {
  situation: 'Situation or triggering event',
  automatic: 'Automatic thoughts',
  physical: 'Physical sensations',
  behavior: 'Behavioral response or urge',
  supporting: 'Evidence supporting the thought',
  otherEvidence: 'Evidence that may not support the thought',
  alternative: 'Alternative perspectives',
  balanced: 'Balanced or helpful thought',
  action: 'Possible next action',
} as const;
export type ThoughtTextKey = keyof typeof thoughtTextFields;

export const thoughtSteps = [
  'Set the scene', 'Notice thoughts and emotions', 'Notice your body and response',
  'Consider what you know', 'Choose a helpful perspective',
];

export const cognitivePatterns = [
  ['All-or-nothing thinking', 'Seeing only two extremes can leave out what happened in between. Is there a middle ground that fits the facts?'],
  ['Catastrophizing', 'A worst-case outcome can feel especially likely or unbearable. What other outcomes are possible, and what would help if the worst did happen?'],
  ['Mind reading', 'Sometimes we infer what someone thinks without having enough information. What did they actually say or do?'],
  ['Overgeneralization', 'One experience can start to feel like a rule for every situation. Where does that rule hold up, and where might it have limits?'],
  ['Emotional reasoning', 'Feelings can be important signals. What else, alongside the feeling, tells you about the situation?'],
  ['Personalization', 'It can be easy to take responsibility for events that have several causes. Which parts were within your control?'],
  ['Should statements', 'A rigid rule about what you or someone else should do can add pressure. Where did that rule come from, and does it serve you here?'],
  ['Mental filtering', 'One detail can take up most of your attention. Are there other details that matter to the account you want to keep?'],
  ['Fortune telling', 'A prediction can start to feel settled before an event happens. What remains uncertain, and what can you prepare for?'],
  ['Labeling', 'A single word about a person can flatten a more complex situation. Can you describe the specific action or event?'],
] as const;

const intensity = z.number().int().min(0).max(100).nullable();
export const thoughtSchema = z.object({
  format: z.literal('thought-v1'),
  stage: z.number().int().min(1).max(thoughtSteps.length),
  date: z.union([z.iso.date(), z.literal('')]),
  time: z.string().regex(/^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9])?$/),
  timezone: z.string().max(100).optional(),
  emotions: emotionList,
  before: intensity,
  after: intensity,
  text: z.partialRecord(z.enum(Object.keys(thoughtTextFields) as ThoughtTextKey[]), z.string().trim().max(2000)),
}).strict();

export type ThoughtEntry = z.infer<typeof thoughtSchema>;
export type ThoughtSnapshot = { id: string; completedAt: string; record: ThoughtEntry };

export const emptyThought: ThoughtEntry = {
  format: 'thought-v1', stage: 1, date: '', time: '', emotions: [], before: null, after: null, text: {},
};

export function readThought(input: unknown): ThoughtEntry {
  const parsed = thoughtSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return emptyThought;
  const legacy = input as Record<string, unknown>;
  const text = (index: number) => typeof legacy[index] === 'string' ? legacy[index] : '';
  const emotion = text(2);
  return { ...emptyThought, emotions: moods.includes(emotion) ? [emotion] : [],
    text: { situation: text(0), automatic: text(1), behavior: text(3) } };
}
