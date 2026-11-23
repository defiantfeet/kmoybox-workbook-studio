import { z } from 'zod';

export const slugSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens.');
const title = z.string().trim().min(1).max(120);
const prompt = z.string().trim().min(1).max(600);
const id = z.uuid();
const block = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('lesson'), body: z.string().trim().min(1).max(6000) }),
  z.object({ id, kind: z.literal('reflection'), prompt }),
  z.object({ id, kind: z.literal('choice'), prompt, options: z.array(z.object({ id, label: title })).min(2).max(8) }),
  z.object({ id, kind: z.literal('rating'), prompt, max: z.number().int().min(2).max(10), low: title, high: title }),
  z.object({ id, kind: z.literal('goal'), prompt }),
]);

export const moduleSchema = z.object({
  format: z.literal(1),
  title,
  chapter: title,
  chapterOrder: z.number().int().min(1).max(999),
  order: z.number().int().min(1).max(999),
  blocks: z.array(block).min(1).max(24),
}).superRefine(({ blocks }, ctx) => {
  if (new Set(blocks.map(item => item.id)).size !== blocks.length) {
    ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'Block IDs must be unique.' });
  }
  blocks.forEach((item, index) => {
    if (item.kind === 'choice' && (new Set(item.options.map(option => option.id)).size !== item.options.length
      || new Set(item.options.map(option => option.label.toLowerCase())).size !== item.options.length)) {
      ctx.addIssue({ code: 'custom', path: ['blocks', index, 'options'], message: 'Each choice needs a distinct option.' });
    }
  });
});

export const workbookSchema = z.object({ slug: slugSchema, title, summary: z.string().trim().min(1).max(500) });
export type ModuleContent = z.infer<typeof moduleSchema>;
export type Block = z.infer<typeof block>;
export type Exercise = Exclude<Block, { kind: 'lesson' }>;
export type WorkbookMetadata = z.infer<typeof workbookSchema>;
export type WorkbookRecord = WorkbookMetadata & { sample: boolean };
export type ModuleRecord = {
  id: string; workbook_slug: string; draft?: ModuleContent; published: ModuleContent | null; revision: number; edit_version?: number;
};
export type GoalAnswer = { goal: string; step: string; date: string };
export type AnswerValue = string | GoalAnswer;
export type ModuleProgress = { module_id: string; revision: number; answers: Record<string, AnswerValue>; completed: boolean; updated_at: string };

export function ordered<T extends { id: string; content: ModuleContent }>(items: T[]) {
  return [...items].sort((a, b) => a.content.chapterOrder - b.content.chapterOrder
    || a.content.chapter.localeCompare(b.content.chapter) || a.content.order - b.content.order || a.id.localeCompare(b.id));
}

export function readAnswers(content: ModuleContent, form: FormData) {
  const answers: Record<string, AnswerValue> = {};
  let complete = true;
  for (const item of content.blocks) {
    if (item.kind === 'lesson') continue;
    const read = (key: string) => String(form.get(key) ?? '').trim();
    if (item.kind === 'goal') {
      const goal = read(item.id + '.goal');
      const step = read(item.id + '.step');
      const date = read(item.id + '.date');
      if (goal.length > 500 || step.length > 500 || (date && !z.iso.date().safeParse(date).success)) {
        return { ok: false, error: 'Check the goal, first step, and target date.' } as const;
      }
      if (goal || step || date) answers[item.id] = { goal, step, date };
      if (!goal || !step) complete = false;
      continue;
    }
    const answer = read(item.id);
    if (!answer) {
      complete = false;
      continue;
    }
    const valid = item.kind === 'reflection' ? answer.length <= 2000
      : item.kind === 'choice' ? item.options.some(option => option.id === answer)
      : /^\d+$/.test(answer) && Number(answer) >= 1 && Number(answer) <= item.max;
    if (!valid) return { ok: false, error: 'Check the response to “' + item.prompt + '”.' } as const;
    answers[item.id] = answer;
  }
  return { ok: true, answers, complete } as const;
}
