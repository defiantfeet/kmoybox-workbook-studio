import { quickEmotions } from './emotions';

type Field = { label: string; options?: readonly string[] };
type Module = { slug: string; title: string; description: string; fields: readonly Field[] };

const text = (label: string): Field => ({ label });
const choice = (label: string, options: readonly string[]): Field => ({ label, options });
const ratings = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export const moods = quickEmotions;
export const checkIns = [
  { key: 'daily', title: 'Daily emotional check-in', prompt: 'How are you feeling right now?' },
  { key: 'morning', title: 'Morning check-in', prompt: 'What would help you start today on your own terms?' },
  { key: 'midday', title: 'Midday check-in', prompt: 'What do you need for the rest of the day?' },
  { key: 'afternoon', title: 'Afternoon check-in', prompt: 'What do you notice about this part of the day?' },
  { key: 'evening', title: 'Evening check-in', prompt: 'What would you like to carry forward from today?' },
] as const;

export const reflection = {
  title: 'Weekly reflection',
  fields: [text('What went well?'), text('What felt challenging?'), text('What is one step you want to take next week?')],
};

export const categories: { title: string; modules: Module[] }[] = [
  { title: 'Self-Discovery', modules: [
    { slug: 'identity-mapping', title: 'Identity Mapping', description: 'Explore the roles, communities, and experiences that shape how you see yourself.', fields: [text('Which roles or communities feel important to you?'), text('Where do you feel most like yourself?'), text('Which part of your identity would you like to make more space for?')] },
    { slug: 'values-assessment', title: 'Values Assessment', description: 'Name the values you want your everyday choices to reflect.', fields: [text('Name three values that matter to you.'), text('When did you recently act on one of these values?'), text('What decision could you make differently this week?')] },
    { slug: 'life-timeline', title: 'Life Timeline', description: 'Look back on a few turning points at a pace that feels right for you.', fields: [text('List a few events in order, with approximate dates.'), text('What did one turning point change for you?'), text('What do you notice when you look at the events together?')] },
  ] },
  { title: 'Mind and Emotions', modules: [
    { slug: 'thought-record', title: 'Thought Record', description: 'Slow down a moment and separate what happened from what went through your mind.', fields: [text('What happened?'), text('What thought came up?'), choice('Which feeling was strongest?', moods), text('How did you respond?')] },
    { slug: 'emotional-wheel', title: 'Emotional Wheel', description: 'Start with a broad feeling and look for words that describe it more precisely.', fields: [choice('Choose a feeling to start with.', moods), text('What more specific words fit, such as relieved, lonely, or disappointed?'), text('What might this feeling be telling you that you need?')] },
    { slug: 'cognitive-reframing', title: 'Cognitive Reframing', description: 'Try a more balanced interpretation of a thought that keeps returning.', fields: [text('What is the thought?'), text('What supports it, and what evidence gives you another perspective?'), text('What is a more balanced thought you could try?')] },
    { slug: 'inner-critic-dialogue', title: 'Inner Critic Dialogue', description: 'Notice a self-critical thought and practice responding with care.', fields: [text('What does your inner critic say?'), text('What might it be trying to protect you from?'), text('What could you say back that is both kind and honest?')] },
    { slug: 'mood-tracker', title: 'Mood Tracker', description: 'Record how you feel and revisit your check-ins over time.', fields: [] },
  ] },
  { title: 'Relationships and Belonging', modules: [
    { slug: 'relationship-inventory', title: 'Relationship Inventory', description: 'Map your connections, reflect on your experiences, and revisit your relationship intentions.', fields: [text('Which connections feel supportive?'), text('Where do you want more space or reciprocity?'), text('What is one step you can take?')] },
    { slug: 'social-integration', title: 'Social Integration', description: 'Explore connection and participation in ways that respect your identity, accessibility needs, and capacity.', fields: [text('Where would you like to feel more connected?'), text('What small action could you take there?'), text('What support would make that action easier?')] },
  ] },
  { title: 'Personal Autonomy', modules: [
    { slug: 'boundary-builder', title: 'Boundary Builder', description: 'Name what you need and choose a next step that fits your situation.', fields: [text('What situation needs a boundary?'), text('What are you willing and able to offer?'), text('How could you communicate your boundary in one sentence?')] },
  ] },
  { title: 'The Embodied Self', modules: [
    { slug: 'body-awareness-map', title: 'Body Awareness Map', description: 'Notice where you feel sensations and describe them in your own words.', fields: [choice('Where do you notice a sensation first?', ['Head or face', 'Shoulders or arms', 'Chest', 'Abdomen', 'Back', 'Legs or feet', 'Several places', 'No clear location']), text('What do you notice in that area or elsewhere?'), text('What response, if any, would feel supportive?')] },
  ] },
  { title: 'Intentional Living', modules: [
    { slug: 'wheel-of-life', title: 'Wheel of Life', description: 'Rate your satisfaction in each area from 1 (very low) to 10 (very high), then choose an area to focus on.', fields: [...['Wellbeing', 'Work or study', 'Finances', 'Relationships', 'Community', 'Rest and play', 'Personal growth', 'Home environment'].map(label => choice(label, ratings)), text('Where would a small change make a difference?')] },
    { slug: 'future-self-visualization', title: 'Future-Self Visualization', description: 'Picture an ordinary day in a future you would like to move toward.', fields: [text('What does that day look and feel like?'), text('What choices helped your future self get there?'), text('What first step could you take this week?')] },
    { slug: 'habit-tracker', title: 'Habit Tracker', description: 'Choose repeatable actions and mark the days you follow through.', fields: [] },
  ] },
];

export const modules = categories.flatMap(category => category.modules);
export function findModule(slug: string) {
  return modules.find(module => module.slug === slug);
}
