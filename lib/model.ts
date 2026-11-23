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
