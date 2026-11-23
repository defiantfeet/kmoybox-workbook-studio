import catalog from './catalog.json';
import { currentWeek, dateKey, type StudioData } from './model';

export function sampleData(now: Date): StudioData {
  const { end } = currentWeek(now);
  const target_date = dateKey(end);
  return {
    ...catalog,
    purchased: ['the-boundaries-edit', 'becoming-her'],
    answers: [
      { prompt_id: 1, body: 'When I give myself time to think before answering.', completed: true },
      { prompt_id: 2, body: 'I need more time for myself.', completed: true },
    ],
    journal: [{ id: 'sample-entry', title: 'Making space', body: 'Today I made time for a quiet morning.', created_at: new Date(now.getTime() - 86_400_000).toISOString() }],
    goals: [
      { id: 'sample-goal-1', title: 'Write one honest journal entry', target_date, completed: false },
      { id: 'sample-goal-2', title: 'Block out an hour for myself', target_date, completed: true },
      { id: 'sample-goal-3', title: 'Practice saying no to one request', target_date, completed: false },
    ],
  };
}
