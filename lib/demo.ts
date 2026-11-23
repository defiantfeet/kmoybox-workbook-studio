import catalog from './catalog.json';
import type { StudioData } from './model';

export const demoData: StudioData = {
  ...catalog,
  purchased: ['the-boundaries-edit', 'becoming-her'],
  answers: [
    { prompt_id: 1, body: 'When I give myself time to think before answering.', completed: true },
    { prompt_id: 2, body: 'I need more time for myself.', completed: true },
  ],
  journal: [{ id: 'sample-entry', title: 'Making space', body: 'Today I made time for a quiet morning.', created_at: '2026-11-20T17:00:00Z' }],
  goals: [
    { id: 'sample-goal-1', title: 'Write in my journal twice this week', target_date: null, completed: false },
    { id: 'sample-goal-2', title: 'Set aside an hour for myself', target_date: null, completed: true },
  ],
};
