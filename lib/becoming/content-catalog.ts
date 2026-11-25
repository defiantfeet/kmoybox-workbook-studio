export const contentEditorPath = '/content-editor/personal-growth';
export const dailyReflectionDestination = 'dashboard-daily-reflection';
export const dailyReflectionDestinationLabel = 'Dashboard → Daily Reflection';

export const contentKinds = {
  prompt: 'Reflection prompt', emotion: 'Emotion vocabulary', value: 'Personal value',
  habit: 'Habit template', scenario: 'Social communication scenario', participation: 'Social participation suggestion',
  boundary: 'Boundary communication template', education: 'Educational explanation', body: 'Body awareness activity',
  future: 'Future-self exercise', weekly: 'Weekly reflection template', availability: 'Module availability',
  category: 'Content category', exercise: 'Reusable exercise template',
} as const;

export type ContentKind = keyof typeof contentKinds;
export type ContentCopy = { title: string; body: string; category: string; available: boolean };
export type PublishedContent = ContentCopy & { item_id: string; kind: ContentKind; module_slug: string | null };
export type ContentVersion = ContentCopy & {
  item_id: string; revision: number; state: 'draft' | 'published' | 'archived';
  effective_at: string | null; saved_at: string;
};
export type ContentItem = { id: string; kind: ContentKind; module_slug: string | null; revision: number; current: ContentVersion };

const destinations: Partial<Record<ContentKind, string[]>> = {
  emotion: ['emotional-wheel', 'mood-tracker', 'thought-record', 'cognitive-reframing', 'body-awareness-map', 'relationship-inventory', 'inner-critic-dialogue'],
  value: ['values-assessment'], habit: ['habit-tracker'], scenario: ['social-integration'],
  participation: ['social-integration'], education: ['thought-record', 'cognitive-reframing'], boundary: ['boundary-builder'], body: ['body-awareness-map'],
  future: ['future-self-visualization'], weekly: ['dashboard'],
};

export function contentFor(content: PublishedContent[], destination: string) {
  return content.filter(item => item.kind !== 'availability' && item.kind !== 'category' &&
    (item.module_slug ? item.module_slug === destination : (destinations[item.kind]?.includes(destination) ?? destination === 'dashboard')));
}

export function moduleAvailable(content: PublishedContent[], slug: string) {
  return !content.some(item => item.kind === 'availability' && item.module_slug === slug && !item.available);
}
