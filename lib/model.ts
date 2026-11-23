export type Product = {
  slug: string; title: string; summary: string; free: boolean;
};
export type Prompt = {
  id: number; product_slug: string; position: number; title: string; question: string;
};
export type Answer = { prompt_id: number; body: string; completed: boolean };
export type Journal = { id: string; title: string; body: string; created_at: string };
export type Goal = { id: string; title: string; target_date: string | null; completed: boolean };
export type StudioData = {
  products: Product[]; prompts: Prompt[]; purchased: string[];
  answers: Answer[]; journal: Journal[]; goals: Goal[];
};
export function progress(product: string, prompts: Prompt[], answers: Answer[]) {
  const exercises = prompts.filter(prompt => prompt.product_slug === product);
  const completed = new Set(answers.filter(answer => answer.completed).map(answer => answer.prompt_id));
  const done = exercises.filter(prompt => completed.has(prompt.id)).length;
  return { total: exercises.length, done, percent: exercises.length ? Math.round(done / exercises.length * 100) : 0 };
}

export function currentWeek(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start, end };
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

const reflections = [
  'What would it look like to give yourself a little more space today?',
  'Where did you make a choice that felt true to you recently?',
  'What expectation could you set down for the rest of today?',
  'What small thing helped you feel more like yourself this week?',
  'What would you say to a friend going through what you’re feeling right now?',
  'What do you need most from yourself today?',
  'What could you make time for this week that feels like yours?',
];

export function dailyReflection(now: Date) {
  return reflections[now.getUTCDay()];
}

export function studioDay(now: Date) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return new Date(date + 'T00:00:00Z');
}
