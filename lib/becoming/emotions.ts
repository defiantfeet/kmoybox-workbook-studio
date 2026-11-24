import { z } from 'zod';

/** KMOYBOX vocabulary. Branches are navigation aids, and a word can fit more than one experience. */
export const emotionTaxonomy = [
  { label: 'Joy', tone: '#f1dba9', branches: [
    { label: 'Enjoyment', terms: ['Joyful', 'Amused', 'Playful', 'Delighted', 'Ecstatic', 'Energetic'] },
    { label: 'Satisfaction', terms: ['Proud', 'Accomplished', 'Fulfilled', 'Confident', 'Empowered', 'Liberated'] },
    { label: 'Anticipation', terms: ['Hopeful', 'Eager', 'Inspired', 'Optimistic', 'Excited', 'Courageous'] },
  ] },
  { label: 'Connection', tone: '#ead1d9', branches: [
    { label: 'Affection', terms: ['Loving', 'Tender', 'Warm toward someone', 'Intimate', 'Sensitive'] },
    { label: 'Belonging', terms: ['Accepted', 'Included', 'Understood', 'Respected', 'Feeling important'] },
    { label: 'Appreciation', terms: ['Grateful', 'Moved', 'Glad to be seen'] },
  ] },
  { label: 'Loss', tone: '#d0dce9', branches: [
    { label: 'Sadness', terms: ['Sad', 'Grieving', 'Heartbroken', 'Desolate', 'Devastated', 'Despairing', 'Low in mood'] },
    { label: 'Distance', terms: ['Lonely', 'Isolated', 'Ignored', 'Alienated', 'Empty', 'Abandoned', 'Distant', 'Withdrawn'] },
    { label: 'Letdown', terms: ['Disappointed', 'Discouraged', 'Disillusioned', 'Powerless'] },
  ] },
  { label: 'Alarm', tone: '#e4d9ed', branches: [
    { label: 'Fear', terms: ['Frightened', 'Terrified', 'Threatened', 'Exposed', 'Scared', 'Vulnerable'] },
    { label: 'Anxious', terms: ['Worried', 'Overwhelmed', 'On edge', 'Uneasy', 'Suspicious', 'Hesitant'] },
    { label: 'Surprise', terms: ['Startled', 'Shocked', 'Astonished', 'Dismayed'] },
  ] },
  { label: 'Resistance', tone: '#edcec6', branches: [
    { label: 'Anger', terms: ['Furious', 'Resentful', 'Provoked', 'Indignant', 'Enraged', 'Infuriated', 'Mad'] },
    { label: 'Frustrated', terms: ['Irritated', 'Impatient', 'Blocked', 'Fed up', 'Feeling confrontational', 'Feeling hostile'] },
    { label: 'Aversion', terms: ['Disgusted', 'Repelled', 'Put off', 'Reluctant', 'Revolted', 'Disapproving', 'Feeling revulsion'] },
  ] },
  { label: 'Vulnerability', tone: '#edd8cb', branches: [
    { label: 'Hurt', terms: ['Rejected', 'Disrespected', 'Overlooked', 'Betrayed', 'Violated', 'Ridiculed', 'Feeling targeted'] },
    { label: 'Self-conscious', terms: ['Embarrassed', 'Ashamed', 'Humiliated', 'Insecure', 'Feeling inadequate', 'Feeling insignificant', 'Feeling inferior'] },
    { label: 'Regret', terms: ['Guilty', 'Remorseful', 'Sorry', 'Wishing for a do-over'] },
  ] },
  { label: 'Evenness', tone: '#dce7d4', branches: [
    { label: 'Calm', terms: ['Peaceful', 'Settled', 'Relieved', 'At ease'] },
    { label: 'Neutral', terms: ['Steady', 'Matter-of-fact', 'Neither pulled nor pushed'] },
    { label: 'Low engagement', terms: ['Bored', 'Uninterested', 'Detached', 'Unmoved', 'Apathetic', 'Indifferent'] },
  ] },
  { label: 'Complexity', tone: '#dce1e8', branches: [
    { label: 'Mixed', terms: ['Bittersweet', 'Torn', 'Relieved and sad', 'Glad and apprehensive', 'Jealous and caring'] },
    { label: 'Uncertain', terms: ['Confused', 'Perplexed', 'Hard to name', 'Still figuring it out', 'Skeptical'] },
    { label: 'Curious', terms: ['Interested', 'Intrigued', 'In awe', 'Open to discovery', 'Amazed', 'Inquisitive'] },
  ] },
] as const;

export const quickEmotions = ['Joyful', 'Calm', 'Hopeful', 'Neutral', 'Sad', 'Anxious', 'Frustrated', 'Overwhelmed', 'Mixed'];
export const emotionSlots = 12;
export const emotionLabel = z.string().trim().min(1).max(60);
export const emotionList = z.array(emotionLabel).max(emotionSlots)
  .refine(values => new Set(values.map(value => value.toLowerCase())).size === values.length);
export const emotionPickerModules = ['cognitive-reframing', 'body-awareness-map', 'relationship-inventory', 'inner-critic-dialogue'];

export const emotionVocabulary = emotionTaxonomy.flatMap(category => [
  { label: category.label, path: 'Broad category' },
  ...category.branches.flatMap(branch => [
    { label: branch.label, path: String(category.label) },
    ...branch.terms.map(label => ({ label, path: category.label + ' › ' + branch.label })),
  ]),
]);

export const emotionEntrySchema = z.object({
  format: z.literal('emotion-v1'),
  emotions: emotionList.refine(values => values.length > 0),
  intensity: z.number().int().min(0).max(100).nullable(),
  sensations: z.string().trim().max(2000),
  context: z.string().trim().max(2000),
  reflection: z.string().trim().max(2000),
}).strict();
export type EmotionEntry = z.infer<typeof emotionEntrySchema>;
export type SavedEmotion = { id: string; completedAt: string; entry: EmotionEntry };

export function parseEmotionField(raw: FormDataEntryValue | null) {
  if (raw === null) return emotionList.safeParse([]);
  try { return emotionList.safeParse(JSON.parse(String(raw))); }
  catch { return emotionList.safeParse(null); }
}

export const emptyEmotionNotes = { intensity: null, sensations: '', context: '', reflection: '' };

export function readEmotionEntry(input: unknown): EmotionEntry | null {
  const parsed = emotionEntrySchema.safeParse(input);
  if (parsed.success) return parsed.data;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const legacy = input as Record<string, unknown>;
  const labels = [legacy[0], legacy[1]].flatMap(value => {
    const result = emotionLabel.safeParse(value);
    return result.success ? [result.data] : [];
  });
  const emotions = labels.filter((label, index) => labels.findIndex(item => item.toLowerCase() === label.toLowerCase()) === index);
  const context = typeof legacy[1] === 'string' && !labels.includes(legacy[1].trim()) ? legacy[1] : '';
  const reflection = typeof legacy[2] === 'string' ? legacy[2] : '';
  return { format: 'emotion-v1', ...emptyEmotionNotes, emotions, context, reflection };
}
