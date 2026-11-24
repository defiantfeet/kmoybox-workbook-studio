import { z } from 'zod';
import { addDays } from './habits';

export const insightsPath = '/becoming/insights';
export const insightCategories = {
  activity: 'Completed exercises and saved activity',
  reflections: 'Recent reflections',
  goals: 'Personal goals',
  values: 'Core values',
  habits: 'Habit consistency',
  mood: 'Mood trends',
  emotions: 'Emotional vocabulary',
  social: 'Social participation',
  belonging: 'Perceived belonging',
  boundaries: 'Boundary reflections',
  wheel: 'Wheel of Life comparisons',
  milestones: 'Upcoming personal milestones',
  observations: 'Descriptive insights',
} as const;
export const insightKeys = Object.keys(insightCategories) as (keyof typeof insightCategories)[];
export type InsightKey = typeof insightKeys[number];

export const insightRanges = {
  today: 'Today', week: 'This week', month: 'This month', ninety: 'Last 90 days', year: 'This year', custom: 'Custom range',
} as const;

export type InsightRange = { key: keyof typeof insightRanges; start: string; end: string; invalid: boolean };
const day = z.iso.date();

export function insightsRange(query: { range?: unknown; start?: unknown; end?: unknown }, today: string, monday: string): InsightRange {
  const key = (Object.keys(insightRanges) as InsightRange['key'][]).find(value => value === query.range) ?? 'month';
  switch (key) {
    case 'today': return { key, start: today, end: today, invalid: false };
    case 'week': return { key, start: monday, end: today, invalid: false };
    case 'ninety': return { key, start: addDays(today, -89), end: today, invalid: false };
    case 'year': return { key, start: today.slice(0, 4) + '-01-01', end: today, invalid: false };
    case 'custom': {
      const start = day.safeParse(query.start);
      const end = day.safeParse(query.end);
      if (start.success && end.success && start.data >= '1900-01-01' && start.data <= end.data && end.data <= today) {
        return { key, start: start.data, end: end.data, invalid: false };
      }
      return { key, start: today.slice(0, 7) + '-01', end: today, invalid: true };
    }
    default: return { key, start: today.slice(0, 7) + '-01', end: today, invalid: false };
  }
}

export const insightConnections = [
  ['Values Assessment', '/becoming/values-assessment', 'Personal Goals', '/goals', 'Turn a ranked value into a goal using the assessment’s practice tools.'],
  ['Values Assessment', '/becoming/values-assessment', 'Habit Tracker', '/becoming/habit-tracker', 'Create a practice habit or choose a saved core value when editing a habit.'],
  ['Identity Mapping', '/becoming/identity-mapping', 'Boundary Builder', '/becoming/boundary-builder', 'Send a chosen next step to a private boundary draft.'],
  ['Thought Record', '/becoming/thought-record', 'Cognitive Reframing', '/becoming/cognitive-reframing', 'Choose a thought record to import and confirm which details to use.'],
  ['Emotional Wheel', '/becoming/emotional-wheel', 'Mood Tracker', '/becoming/mood-tracker', 'Choose an Emotional Wheel entry and bring its labels into a new mood check-in.'],
  ['Mood Tracker', '/becoming/mood-tracker', 'Body Awareness Map', '/becoming/body-awareness-map', 'Choose which saved emotion labels to bring into a separate body observation.'],
  ['Relationship Inventory', '/becoming/relationship-inventory', 'Social Integration', '/becoming/social-integration?section=journal', 'Open the interaction journal from a relationship entry and choose whether to use its label.'],
  ['Life Timeline', '/becoming/life-timeline', 'Future-Self Visualization', '/becoming/future-self-visualization', 'Use a precisely dated future milestone as a starting point for a horizon.'],
  ['Social Integration', '/becoming/social-integration?section=goals', 'Personal Goals', '/goals', 'Create a social goal that also appears in your personal goals.'],
] as const;

// Find the first instant on a calendar date in the selected zone, including midnight offset changes.
export function insightDayStart(day: string, formatDay: (date: Date) => string) {
  let low = Date.parse(addDays(day, -2) + 'T00:00:00Z');
  let high = Date.parse(addDays(day, 2) + 'T00:00:00Z');
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (formatDay(new Date(middle)) < day) low = middle;
    else high = middle;
  }
  return new Date(high).toISOString();
}
