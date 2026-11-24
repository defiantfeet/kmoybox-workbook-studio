'use server';

import { z } from 'zod';
import { moods } from './shared';
import { workbookLinks } from './workbook-links';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { account, demoSnapshot } from '../data';
import type { ActionState } from '../actions';
import { demo } from '../session';
import { changeDemoWorkbooks } from '../workbooks/demo-store';

const journalId = z.uuid();
const journalInput = z.object({
  title: z.string().trim().max(140),
  body: z.string().trim().max(10000),
  mood: z.string().refine(value => value === '' || Object.hasOwn(moods, value)),
  workbook_ref: z.string().max(100),
});
const error = (message: string): ActionState => ({ message, error: true });

export async function deleteJournalEntry(id: string, _: ActionState): Promise<ActionState> {
  if (demo) {
    const fallback = (await demoSnapshot()).journal;
    await changeDemoWorkbooks(state => { state.journal = (state.journal ?? fallback).filter(item => item.id !== id); });
    (await cookies()).delete('studio-journal');
  } else {
    const { client, user } = await account(true);
    const { error: failure } = await client.from('journal_entries').delete().eq('id', id).eq('user_id', user.id);
    if (failure) return error('Could not delete the entry.');
  }
  revalidatePath('/', 'layout');
  return { message: 'Entry deleted.' };
}

export async function saveMilestone(goalId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get('id') ?? '');
  const title = String(form.get('title') ?? '').trim();
  const intent = form.get('intent');
  const completed = form.get('completed') === 'true';
  if ((!id || intent === 'edit') && (!title || title.length > 140)) return error('Enter a milestone up to 140 characters.');
  if (!['add', 'edit', 'toggle', 'delete'].includes(String(intent)) || (!id && intent !== 'add')) return error('Choose a milestone action.');
  if (demo) {
    const fallback = (await demoSnapshot()).goals;
    const saved = await changeDemoWorkbooks(state => {
      if (!(state.goals ?? fallback).some(item => item.id === goalId)) return false;
      const all = state.milestones ?? [];
      const old = all.find(item => item.id === id && item.goal_id === goalId);
      const now = new Date().toISOString();
      if (id && !old) return false;
      let kind = '';
      if (!old) {
        state.milestones = [...all, { id: crypto.randomUUID(), goal_id: goalId, title, completed: false, created_at: now }];
        kind = 'milestone-added';
      } else if (intent === 'delete') {
        state.milestones = all.filter(item => item.id !== id);
        kind = 'milestone-removed';
      } else {
        state.milestones = all.map(item => item.id === id ? intent === 'toggle' ? { ...item, completed } : { ...item, title } : item);
        if (intent === 'toggle' && completed !== old.completed) kind = completed ? 'milestone-completed' : 'milestone-reopened';
      }
      if (kind) state.activity = [{ id: crypto.randomUUID(), goal_id: goalId, title: old?.title ?? title, kind, created_at: now }, ...(state.activity ?? [])];
      return true;
    });
    if (!saved) return error('Milestone or goal unavailable.');
  } else {
    const { client, user } = await account(true);
    const table = client.from('goal_milestones');
    const result = !id ? await table.insert({ goal_id: goalId, user_id: user.id, title })
      : await (intent === 'delete' ? table.delete() : table.update(intent === 'toggle' ? { completed } : { title }))
        .eq('id', id).eq('goal_id', goalId).eq('user_id', user.id).select('id').single();
    if (result.error) return error('Could not save the milestone.');
  }
  revalidatePath('/', 'layout');
  return { message: intent === 'delete' ? 'Milestone removed.' : 'Milestone saved.' };
}

export async function deletePersonalActivity(_: ActionState, form: FormData): Promise<ActionState> {
  if (form.get('confirmation') !== 'DELETE') return error('Type DELETE to confirm.');
  if (demo) {
    await changeDemoWorkbooks(state => {
      state.journal = []; state.goals = []; state.milestones = []; state.activity = [];
      state.legacyAnswers = []; state.progress = [];
    });
    const jar = await cookies();
    ['studio-journal', 'studio-goals', 'studio-answers'].forEach(key => jar.delete(key));
  } else {
    const { client } = await account(true);
    const result = await client.rpc('delete_personal_activity');
    if (result.error) return error('Could not delete your activity.');
  }
  revalidatePath('/', 'layout');
  return { message: 'Personal activity deleted.' };
}

export async function autosaveJournal(
  id: string,
  revision: string | null,
  entry: { title: string; body: string; mood: string; workbook_ref: string },
): Promise<{ updatedAt: string } | { error: string }> {
  const parsed = journalInput.safeParse(entry);
  if (!parsed.success || !journalId.safeParse(id).success && !(demo && id === 'sample-entry')) return { error: 'Check the entry fields and try again.' };
  const { title, body, mood, workbook_ref } = parsed.data;
  if (!title && !body) return { error: 'Add a title or reflection before saving.' };
  const fields = { title, body, mood: mood || null, workbook_ref: workbook_ref || null };
  const updated_at = new Date().toISOString();
  const conflict = { error: 'This entry changed in another view. Copy your unsaved text before reloading.' };
  if (demo) {
    const snapshot = await demoSnapshot();
    const previous = snapshot.journal.find(item => item.id === id);
    if (workbook_ref && workbook_ref !== previous?.workbook_ref
      && !(await workbookLinks(snapshot, true)).some(item => item.ref === workbook_ref)) return { error: 'Workbook response unavailable.' };
    const saved = await changeDemoWorkbooks(state => {
      const entries = state.journal ?? snapshot.journal;
      const current = entries.find(item => item.id === id);
      if ((current?.updated_at ?? current?.created_at ?? null) !== revision) return false;
      const changed = { ...fields, id, created_at: current?.created_at ?? updated_at, updated_at };
      state.journal = current ? entries.map(item => item.id === id ? changed : item) : [changed, ...entries];
      return true;
    });
    if (!saved) return conflict;
    (await cookies()).delete('studio-journal');
  } else {
    const { client, user } = await account(true);
    const table = client.from('journal_entries');
    const result = revision
      ? await table.update({ ...fields, updated_at }).eq('id', id).eq('user_id', user.id).eq('updated_at', revision).select('id').maybeSingle()
      : await table.insert({ ...fields, id, user_id: user.id, updated_at }).select('id').single();
    if (result.error?.code === '23514') return { error: 'Workbook response unavailable.' };
    if (result.error?.code === '23505' || !result.error && !result.data) {
      const { data: saved } = await table.select('title,body,mood,workbook_ref,updated_at')
        .eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!saved || saved.title !== title || saved.body !== body
        || saved.mood !== fields.mood || saved.workbook_ref !== fields.workbook_ref) return conflict;
      revalidatePath('/journal');
      revalidatePath('/');
      return { updatedAt: saved.updated_at };
    }
    if (result.error) return { error: 'Could not save the entry. Try again.' };
  }
  revalidatePath('/journal');
  revalidatePath('/');
  return { updatedAt: updated_at };
}
