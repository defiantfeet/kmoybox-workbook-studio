import { z } from 'zod';
import { emotionList } from './emotions';

export const dialogueThemes = [
  'Perfectionism', 'Appearance', 'Productivity', 'Social comparison', 'Fear of rejection',
  'Achievement', 'Family expectations', 'Belonging', 'Professional performance',
] as const;

export const criticQuestions = [
  ['message', 'What am I telling myself?'],
  ['trigger', 'What triggered this self-critical thought?'],
  ['learned', 'Where might I have learned this message?'],
  ['expectation', 'What expectation is attached to it?'],
] as const;

export const compassionateQuestions = [
  ['values', 'Is this expectation consistent with my values?'],
  ['purpose', 'What might this critical thought be trying to accomplish?'],
  ['response', 'What would a compassionate and realistic response sound like?'],
  ['action', 'What action would support me now?'],
] as const;

export const maxExchanges = 8;
export const maxAnchors = 8;
const answer = z.string().trim().max(2000);
const anchor = z.object({
  kind: z.enum(['value', 'identity']), label: z.string().trim().min(1).max(80),
}).strict();
const exchange = z.object({
  id: z.uuid(), message: answer, trigger: answer, learned: answer, expectation: answer,
  values: answer, purpose: answer, response: answer, action: answer,
}).strict();
export const dialogueSchema = z.object({
  format: z.literal('dialogue-v1'),
  themes: z.array(z.enum(dialogueThemes)).max(dialogueThemes.length),
  exchanges: z.array(exchange).min(1).max(maxExchanges),
  emotions: emotionList, anchors: z.array(anchor).max(maxAnchors),
}).strict().refine(entry =>
  new Set(entry.themes).size === entry.themes.length
  && new Set(entry.exchanges.map(item => item.id)).size === entry.exchanges.length
  && new Set(entry.anchors.map(item => item.kind + '/' + item.label.toLowerCase())).size === entry.anchors.length);

export type DialogueEntry = z.infer<typeof dialogueSchema>;
export type DialogueExchange = DialogueEntry['exchanges'][number];
export type DialogueAnchor = DialogueEntry['anchors'][number];
export type DialogueSnapshot = { id: string; completedAt: string; entry: DialogueEntry };
export type Statement = { id: string; body: string; created_at: string };
export const statementText = z.string().trim().min(1).max(500);

export function newExchange(id: string): DialogueExchange {
  return { id, message: '', trigger: '', learned: '', expectation: '', values: '', purpose: '', response: '', action: '' };
}

export const emptyDialogue: DialogueEntry = {
  format: 'dialogue-v1', themes: [], exchanges: [newExchange('00000000-0000-4000-8000-000000000001')], emotions: [], anchors: [],
};

export function readDialogue(input: unknown): DialogueEntry {
  const result = dialogueSchema.safeParse(input);
  if (result.success) return result.data;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return emptyDialogue;
  const legacy = input as Record<string, unknown>;
  const notes = (key: string) => typeof legacy[key] === 'string' ? legacy[key] : '';
  const emotions = emotionList.safeParse(legacy.emotions);
  return { ...emptyDialogue, emotions: emotions.data ?? [], exchanges: [{
    ...emptyDialogue.exchanges[0], message: notes('0'), purpose: notes('1'), response: notes('2'),
  }] };
}

export function hasDialogueContent(entry: DialogueEntry) {
  return Boolean(entry.emotions.length || entry.themes.length || entry.anchors.length
    || entry.exchanges.some(item => [...criticQuestions, ...compassionateQuestions].some(([key]) => item[key].trim())));
}
