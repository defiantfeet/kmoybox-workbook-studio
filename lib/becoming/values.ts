import { z } from 'zod';

const groups = [
  { title: 'Relationships and care', entries: [
    ['kindness', 'Kindness', 'Make everyday choices that ease someone else’s day.'],
    ['belonging', 'Belonging', 'Help create places where people feel welcome as they are.'],
    ['loyalty', 'Loyalty', 'Stay dependable to the people and commitments you stand behind.'],
    ['empathy', 'Empathy', 'Try to understand someone’s experience from their point of view.'],
    ['forgiveness', 'Forgiveness', 'Make room to move forward after harm at a pace you choose.'],
    ['generosity', 'Generosity', 'Offer your time, attention, or resources within your means.'],
    ['mutuality', 'Mutuality', 'Build relationships where care and effort can go both ways.'],
    ['friendship', 'Friendship', 'Make time for companionship, trust, and shared enjoyment.'],
  ] },
  { title: 'Character and choices', entries: [
    ['honesty', 'Honesty', 'Speak and act in ways that reflect what you understand to be true.'],
    ['integrity', 'Integrity', 'Keep your actions consistent with the principles you claim.'],
    ['courage', 'Courage', 'Take a worthwhile step even when you feel unsure or afraid.'],
    ['humility', 'Humility', 'Recognize what you know while staying open to what you might miss.'],
    ['accountability', 'Accountability', 'Own the effects of your choices and follow through on repair.'],
    ['patience', 'Patience', 'Give people and processes the time they need to unfold.'],
    ['reliability', 'Reliability', 'Honor agreements and communicate promptly when plans change.'],
    ['discernment', 'Discernment', 'Consider what matters before deciding where to commit.'],
  ] },
  { title: 'Learning and making', entries: [
    ['curiosity', 'Curiosity', 'Follow questions with genuine interest in what you might learn.'],
    ['creativity', 'Creativity', 'Find new ways to express an idea or meet a need.'],
    ['craft', 'Craft', 'Give attention to the skill and care behind what you make.'],
    ['inquiry', 'Inquiry', 'Check assumptions and seek evidence before reaching a conclusion.'],
    ['learning', 'Learning', 'Keep building knowledge and skills through practice and reflection.'],
    ['adaptability', 'Adaptability', 'Adjust your approach when circumstances or understanding change.'],
    ['imagination', 'Imagination', 'Picture possibilities beyond the options already in front of you.'],
    ['resourcefulness', 'Resourcefulness', 'Find workable options using what you can access now.'],
  ] },
  { title: 'Freedom and direction', entries: [
    ['autonomy', 'Autonomy', 'Make your own informed choices about how you live.'],
    ['purpose', 'Purpose', 'Give your time to things that feel worth doing.'],
    ['initiative', 'Initiative', 'Begin a useful action without waiting for every detail to be settled.'],
    ['self-respect', 'Self-respect', 'Treat your needs, limits, and commitments as worthy of care.'],
    ['authenticity', 'Authenticity', 'Make room for your preferences and experience in how you show up.'],
    ['flexibility', 'Flexibility', 'Leave space to revise plans and choose again.'],
    ['intentionality', 'Intentionality', 'Decide where your attention and energy go.'],
    ['adventure', 'Adventure', 'Make room for unfamiliar experiences and discovery.'],
  ] },
  { title: 'Collective life', entries: [
    ['justice', 'Justice', 'Notice unfairness and act toward fairer conditions and outcomes.'],
    ['dignity', 'Dignity', 'Treat every person as worthy of respect and consideration.'],
    ['accessibility', 'Accessibility', 'Reduce barriers so more people can take part.'],
    ['solidarity', 'Solidarity', 'Stand with people working toward a shared need or cause.'],
    ['service', 'Service', 'Put your time or skills to use for a need beyond your own.'],
    ['stewardship', 'Stewardship', 'Care for shared resources and consider who will rely on them later.'],
    ['participation', 'Participation', 'Take an active role in the decisions and communities that affect you.'],
    ['fairness', 'Fairness', 'Give people considered treatment and explain how decisions are made.'],
  ] },
  { title: 'Wellbeing and everyday life', entries: [
    ['rest', 'Rest', 'Protect time to recover and do less.'],
    ['presence', 'Presence', 'Give the moment in front of you your attention.'],
    ['play', 'Play', 'Make time for activities you enjoy for their own sake.'],
    ['health', 'Health', 'Support the conditions that help your body and mind function well.'],
    ['simplicity', 'Simplicity', 'Make daily choices easier by keeping what is useful or meaningful.'],
    ['stability', 'Stability', 'Create routines and resources you can depend on.'],
    ['beauty', 'Beauty', 'Notice and make room for experiences that delight your senses.'],
    ['financial-care', 'Financial care', 'Use money in ways that support your needs and commitments.'],
  ] },
  { title: 'Meaning and continuity', entries: [
    ['gratitude', 'Gratitude', 'Notice what you receive and show appreciation when you can.'],
    ['wonder', 'Wonder', 'Leave room to be surprised by what you encounter.'],
    ['hope', 'Hope', 'Give attention to possibilities you can help make real.'],
    ['tradition', 'Tradition', 'Carry forward practices that connect you to people or history.'],
    ['spirituality', 'Spirituality', 'Make space for practices or questions that give life depth.'],
    ['remembrance', 'Remembrance', 'Keep meaningful people and experiences present in your choices.'],
    ['legacy', 'Legacy', 'Consider what your work, care, and choices leave for others.'],
    ['nature', 'Connection to nature', 'Make time to notice, enjoy, and care for the living world.'],
  ] },
  { title: 'Work and commitments', entries: [
    ['focus', 'Focus', 'Give sustained attention to one worthwhile task at a time.'],
    ['persistence', 'Persistence', 'Return to a worthwhile effort when progress takes time.'],
    ['collaboration', 'Collaboration', 'Work with others and share responsibility for the result.'],
    ['excellence', 'Excellence', 'Set a meaningful standard and improve the work that matters.'],
    ['experimentation', 'Experimentation', 'Try a small change and learn from what happens.'],
    ['practicality', 'Practicality', 'Choose actions that fit your real resources and circumstances.'],
    ['contribution', 'Contribution', 'Offer something useful to a shared effort.'],
    ['independence', 'Independence', 'Develop the skills and resources to take care of what you can.'],
  ] },
] as const;

export const valueGroups = groups.map(group => ({ title: group.title, values: group.entries.map(([id, label, definition]) => ({ id, label, definition })) }));
export const valueLibrary = valueGroups.flatMap(group => group.values);

export const valuePrompts = [
  ['matter', 'Why does this matter to me?'],
  ['influence', 'Is this value personally chosen or influenced by others?'],
  ['actions', 'How do my current actions reflect this value?'],
  ['conflict', 'Where do I experience conflict with this value?'],
  ['respect', 'How can I express this value while respecting others?'],
  ['week', 'What is one action I can take this week?'],
] as const;
export type PromptKey = typeof valuePrompts[number][0];
const promptKeys = valuePrompts.map(([key]) => key);
const id = z.string().regex(/^[a-z0-9-]{1,48}$/);
const list = (limit: number) => z.array(id).max(limit).refine(ids => new Set(ids).size === ids.length);
const custom = z.object({ id: id.regex(/^custom-[a-z0-9-]+$/), label: z.string().trim().min(1).max(80), definition: z.string().trim().min(1).max(240) }).strict();
export const valuesSchema = z.object({
  format: z.literal('values-v1'), stage: z.number().int().min(1).max(6),
  custom: z.array(custom).max(15), selected: list(15), shortlist: list(10), ranked: list(5),
  responses: z.record(id, z.partialRecord(z.enum(promptKeys), z.string().trim().max(1500))),
  statement: z.string().trim().max(10000),
  earlier: z.array(z.string().max(2000)).max(3).optional(),
}).strict().refine(data => {
  const labels = [...valueLibrary, ...data.custom].map(value => value.label.toLowerCase());
  const ids = new Set([...valueLibrary, ...data.custom].map(value => value.id));
  return new Set(labels).size === labels.length && ids.size === labels.length
    && data.selected.every(key => ids.has(key)) && data.shortlist.every(key => data.selected.includes(key))
    && data.ranked.every(key => data.shortlist.includes(key)) && Object.keys(data.responses).every(key => ids.has(key))
    && Object.keys(data.responses).length <= 15;
});
export type ValuesDraft = z.infer<typeof valuesSchema>;
export type ValueDefinition = { id: string; label: string; definition: string };
export type ValuesVersion = { id: string; completed_at: string; answers: ValuesDraft };
export const emptyValues: ValuesDraft = {
  format: 'values-v1', stage: 1, custom: [], selected: [], shortlist: [], ranked: [], responses: {}, statement: '',
};
export const readyToComplete = (draft: ValuesDraft) =>
  draft.stage === 6 && draft.shortlist.length === 10 && draft.ranked.length === 5 && Boolean(draft.statement.trim());

export const practiceKinds = ['habit', 'boundary', 'goal', 'social'] as const;
export type PracticeKind = typeof practiceKinds[number];
export const practiceLabels: Record<PracticeKind, { title: string; href: string }> = {
  habit: { title: 'Habit', href: '/becoming/habit-tracker' },
  boundary: { title: 'Boundary Builder', href: '/becoming/boundary-builder' },
  goal: { title: 'Personal goal', href: '/goals' },
  social: { title: 'Social Integration', href: '/becoming/social-integration' },
};

export type ValuePractice = {
  id: string; assessment_id: string; value_key: string; kind: PracticeKind; next_step: string;
};

export function readValuesAnswers(input: unknown): ValuesDraft | null {
  const parsed = valuesSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
