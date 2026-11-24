import { z } from 'zod';

export const onboardingPath = '/becoming/onboarding';
export const explorationTopics = {
  identity: 'Identity and self-discovery',
  emotions: 'Emotional awareness',
  relationships: 'Relationships',
  boundaries: 'Personal boundaries',
  belonging: 'Social connection and belonging',
  habits: 'Habits and routines',
  body: 'Body awareness',
  future: 'Future goals',
  growth: 'General personal growth',
} as const;

export const reflectionOptions = ['Whenever I choose', 'Daily', 'A few times a week', 'Weekly', 'Monthly'] as const;
export const participationOptions = ['Mostly on my own', 'One-to-one connections', 'Small groups', 'Community activities', 'Exploring my options'] as const;
export const accessibilityOptions = ['Written prompts', 'Visual tools', 'Keyboard-first activities', 'Short steps', 'Stillness or seated options'] as const;
export const durationOptions = ['5 minutes or less', 'About 10 minutes', 'About 20 minutes', 'Flexible'] as const;
export const notificationOptions = ['No reminders', 'In-app reminders', 'Decide later'] as const;

const topicKeys = Object.keys(explorationTopics) as (keyof typeof explorationTopics)[];
const distinct = (items: readonly string[]) => new Set(items).size === items.length;
const optional = <T extends readonly [string, ...string[]]>(options: T) => z.union([z.literal(''), z.enum(options)]);
export const onboardingSchema = z.object({
  topics: z.array(z.enum(topicKeys)).max(9).refine(distinct),
  goals: z.array(z.string().trim().max(160)).max(5).transform(items => items.filter(Boolean)),
  frequency: optional(reflectionOptions),
  times: z.array(z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)).max(4).refine(distinct),
  participation: optional(participationOptions),
  accessibility: z.array(z.enum(accessibilityOptions)).max(accessibilityOptions.length).refine(distinct),
  duration: optional(durationOptions),
  reminders: optional(notificationOptions),
});
export type OnboardingPreferences = z.infer<typeof onboardingSchema>;
export const emptyOnboarding: OnboardingPreferences = {
  topics: [], goals: [], frequency: '', times: [], participation: '', accessibility: [], duration: '', reminders: '',
};

type Tool = { slug: string; title: string; reason: string };

const tools: Record<keyof typeof explorationTopics, Tool> = {
  identity: { slug: 'identity-mapping', title: 'Identity Mapping', reason: 'You chose identity and self-discovery. Map the roles, values, and experiences that matter to you.' },
  emotions: { slug: 'emotional-wheel', title: 'Emotional Wheel', reason: 'You chose emotional awareness. Explore words for what you notice.' },
  relationships: { slug: 'relationship-inventory', title: 'Relationship Inventory', reason: 'You chose relationships. Reflect on the connections you want to understand or nurture.' },
  boundaries: { slug: 'boundary-builder', title: 'Boundary Builder', reason: 'You chose personal boundaries. Explore what you need and what choices are within your control.' },
  belonging: { slug: 'social-integration', title: 'Social Integration', reason: 'You chose social connection and belonging. Explore participation at a pace that feels right.' },
  habits: { slug: 'habit-tracker', title: 'Habit Tracker', reason: 'You chose habits and routines. Start with one manageable action.' },
  body: { slug: 'body-awareness-map', title: 'Body Awareness Map', reason: 'You chose body awareness. Record a sensation or try a stillness reflection if you wish.' },
  future: { slug: 'future-self-visualization', title: 'Future-Self Visualization', reason: 'You chose future goals. Explore a possible future and identify one realistic next step.' },
  growth: { slug: 'wheel-of-life', title: 'Wheel of Life', reason: 'You chose general personal growth. Start by noticing which areas you want to explore.' },
};

export function startingPlan(preferences: OnboardingPreferences): Tool[] {
  const suggested = preferences.topics.map(topic => {
    if (topic === 'emotions' && (preferences.duration === '5 minutes or less' || preferences.frequency === 'Daily')) {
      return { slug: 'mood-tracker', title: 'Mood Tracker',
        reason: 'You chose emotional awareness and a short or daily practice. Try a quick check-in.' };
    }
    if (topic === 'belonging' && preferences.participation === 'Mostly on my own') {
      return { ...tools.belonging, reason: 'You chose belonging and prefer exploring on your own. Start with the private Social Self-Awareness section.' };
    }
    if (topic === 'body' && preferences.accessibility.includes('Written prompts')) {
      return { ...tools.body, reason: 'You chose body awareness and written prompts. Use the region checklist or the optional written reflection.' };
    }
    return tools[topic];
  });
  if (!suggested.length && preferences.goals.some(goal => goal.trim())) {
    suggested.push({ ...tools.future, reason: 'You added a custom goal. Use this tool to turn it into a next step in your own words.' });
  }
  return suggested.slice(0, 3);
}
