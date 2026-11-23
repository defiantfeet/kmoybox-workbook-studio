'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { account, demoSnapshot } from './data';
import { demo } from './session';
import { z } from 'zod';
import { changeDemoWorkbooks } from './workbooks/demo-store';
import { workbookLinks } from './personal/workbook-links';

const value = (form: FormData, key: string) => String(form.get(key) ?? '');
export type ActionState = { message: string; error?: boolean };
const failure = (message: string): ActionState => ({ message, error: true });

export async function save(kind: string, _: ActionState, form: FormData): Promise<ActionState> {
  const id = value(form, 'id');
  const intent = value(form, 'intent');
  const title = value(form, 'title').trim();
  const body = value(form, 'body').trim();
  const target_date = value(form, 'date') || null;
  const workbook_ref = value(form, 'workbook_ref') || null;
  const prompt_id = Number(id);
  const completed = value(form, 'completed') === 'true';
  const removing = intent === 'delete';
  const finishing = intent === 'toggle';
  if (!['workbook', 'goal'].includes(kind)) return failure('Unknown form.');
  if (target_date && !z.iso.date().safeParse(target_date).success) return failure('Enter a valid date.');
  if (!removing && !finishing) {
    if (kind !== 'workbook' && (!title || title.length > 140)) return failure('Enter a title up to 140 characters.');
    if (kind !== 'goal' && (!body || body.length > 10000)) return failure('Enter a response up to 10,000 characters.');
  }
  if (kind === 'workbook' && (!Number.isSafeInteger(prompt_id) || prompt_id < 1 || removing || finishing)) {
    return failure('Choose a valid exercise.');
  }
  if (kind !== 'workbook' && (removing || finishing) && !id) return failure('Choose an item.');

  if (demo) {
    const snapshot = await demoSnapshot();
    const jar = await cookies();
    if (kind === 'workbook') {
      if (!snapshot.prompts.some(prompt => prompt.id === prompt_id)) return failure('Exercise unavailable.');
      await changeDemoWorkbooks(state => {
        state.legacyAnswers = [...(state.legacyAnswers ?? snapshot.answers).filter(item => item.prompt_id !== prompt_id),
          { prompt_id, body, completed: intent === 'complete' }];
      });
      jar.delete('studio-answers');
    } else {
      const original = snapshot.goals.find(item => item.id === id);
      if (!removing && !finishing && workbook_ref && workbook_ref !== original?.workbook_ref
        && !(await workbookLinks(snapshot, false)).some(item => item.ref === workbook_ref)) return failure('Workbook exercise unavailable.');
      const saved = await changeDemoWorkbooks(state => {
        const goals = state.goals ?? snapshot.goals;
        const goal = goals.find(item => item.id === id);
        if (id && !goal) return false;
        const now = new Date().toISOString();
        if (removing) {
          state.goals = goals.filter(item => item.id !== id);
          state.milestones = (state.milestones ?? []).filter(item => item.goal_id !== id);
          state.activity = (state.activity ?? []).filter(item => item.goal_id !== id);
        } else if (goal) {
          state.goals = goals.map(item => item.id === id ? finishing ? { ...item, completed } : { ...item, title, target_date, workbook_ref } : item);
          if (finishing && completed !== goal.completed) state.activity = [
            { id: crypto.randomUUID(), goal_id: id, title: goal.title, kind: completed ? 'goal-completed' : 'goal-reopened', created_at: now }, ...(state.activity ?? [])];
        } else {
          const newId = crypto.randomUUID();
          state.goals = [...goals, { id: newId, title, target_date, workbook_ref, completed: false, created_at: now }];
          state.activity = [{ id: crypto.randomUUID(), goal_id: newId, title, kind: 'goal-created', created_at: now }, ...(state.activity ?? [])];
        }
        return true;
      });
      if (!saved) return failure('Goal unavailable.');
      jar.delete('studio-goals');
    }
  } else {
    const { client, user } = await account(true);
    const user_id = user.id;
    const table = 'goals';
    const fields = finishing ? { completed } : { title, target_date, workbook_ref };
    const result = kind === 'workbook'
      ? await client.from('responses').upsert({ user_id, prompt_id, body, completed: intent === 'complete' })
      : removing ? await client.from(table).delete().eq('id', id).eq('user_id', user_id).select('id').single()
      : id ? await client.from(table).update(fields).eq('id', id).eq('user_id', user_id).select('id').single()
      : await client.from(table).insert({ user_id, ...fields });
    if (result.error) return failure('Your change could not be saved. Check the fields and try again.');
  }
  revalidatePath('/', 'layout');
  return { message: removing ? 'Removed.' : 'Saved.' };
}

export async function updateWeeklyGoal(state: ActionState, form: FormData) {
  const [id, completed] = value(form, 'goal').split(':');
  if (!id || (completed !== 'true' && completed !== 'false')) return failure('Choose a goal.');
  const update = new FormData();
  update.set('id', id);
  update.set('completed', completed);
  update.set('intent', 'toggle');
  return save('goal', state, update);
}
