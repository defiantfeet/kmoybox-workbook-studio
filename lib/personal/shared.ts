export const moods = {
  calm: 'Calm', energized: 'Energized', hopeful: 'Hopeful', tired: 'Tired', unsettled: 'Unsettled', mixed: 'Mixed',
} as const;

export const activityLabels: Record<string, string> = {
  'goal-created': 'Goal created', 'goal-completed': 'Goal completed', 'goal-reopened': 'Goal reopened',
  'milestone-added': 'Milestone added', 'milestone-completed': 'Milestone completed',
  'milestone-reopened': 'Milestone reopened', 'milestone-removed': 'Milestone removed',
};

export function goalProgress(goal: { completed: boolean }, milestones: { completed: boolean }[]) {
  const done = milestones.filter(item => item.completed).length;
  return { done, percent: milestones.length ? Math.round(done / milestones.length * 100) : goal.completed ? 100 : 0 };
}
