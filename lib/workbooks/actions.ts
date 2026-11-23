'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionState } from '../actions';
import { account, demoSnapshot } from '../data';
import { demo } from '../session';
import { changeDemoWorkbooks } from './demo-store';
import { editorAccess, publishedWorkbook } from './repository';
import { moduleSchema, readAnswers, workbookSchema, type ModuleContent, type ModuleProgress } from './schema';

const error = (message: string): ActionState => ({ message, error: true });
const invalidVersion = 'This module changed. Reload before making another change.';
const field = (form: FormData, key: string) => String(form.get(key) ?? '');

export async function saveModuleResponses(slug: string, id: string, revision: number, _: ActionState, form: FormData): Promise<ActionState> {
  const workbook = await publishedWorkbook(slug);
  const module = workbook?.modules.find(item => item.id === id);
  if (!module || module.revision !== revision) return error(invalidVersion);
  const parsed = readAnswers(module.content, form);
  if (!parsed.ok) return error(parsed.error);
  const completing = field(form, 'intent') === 'complete';
  const completed = parsed.complete && (completing || module.completed);
  const record: ModuleProgress = { module_id: id, revision, answers: parsed.answers, completed, updated_at: new Date().toISOString() };

  if (demo) {
    const saved = await changeDemoWorkbooks(state => {
      if (!state.modules.some(item => item.id === id && item.revision === revision)) return false;
      state.progress = [...state.progress.filter(item => item.module_id !== id), record];
      return true;
    });
    if (!saved) return error(invalidVersion);
  } else {
    const { client, user } = await account(true);
    const result = await client.from('engine_progress').upsert({ user_id: user.id, ...record });
    if (result.error) return error(result.error.code === '23514' ? invalidVersion : 'Could not save your responses. Try again.');
  }
  revalidatePath('/workbooks/' + slug);
  if (completing && !completed) return error('Draft saved. Answer every exercise before completing the module.');
  return { message: completing ? 'Module completed.' : 'Responses saved.' };
}

export async function createWorkbook(_: ActionState, form: FormData): Promise<ActionState> {
  const session = demo ? null : await editorAccess();
  const parsed = workbookSchema.safeParse({ slug: form.get('slug'), title: form.get('title'), summary: form.get('summary') });
  if (!parsed.success) return error(parsed.error.issues[0].message);
  const book = { ...parsed.data, sample: false };
  if (session) {
    const existing = await session.client.from('products').select('slug').eq('slug', book.slug).maybeSingle();
    if (existing.error) return error('Could not check the workbook URL.');
    if (existing.data) return error('This workbook URL is already in use.');
    const result = await session.client.from('engine_workbooks').insert(book);
    if (result.error) return error(result.error.code === '23505' ? 'This workbook URL is already in use.' : 'Could not create the workbook.');
  } else {
    if ((await demoSnapshot()).products.some(product => product.slug === book.slug)) return error('This workbook URL is already in use.');
    const created = await changeDemoWorkbooks(state => {
      if (state.books.some(item => item.slug === book.slug)) return false;
      state.books.push(book);
      return true;
    });
    if (!created) return error('This workbook URL is already in use.');
  }
  revalidatePath('/content-editor');
  redirect('/content-editor?workbook=' + book.slug);
}

export async function saveModuleDraft(slug: string, id: string | null, version: number, content: ModuleContent): Promise<ActionState> {
  const session = demo ? null : await editorAccess();
  const parsed = moduleSchema.safeParse(content);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return error(issue.path.join(' · ') + ': ' + issue.message);
  }
  const moduleId = id ?? crypto.randomUUID();
  if (session) {
    const { client } = session;
    const result = id
      ? await client.from('engine_module_drafts').update({ content: parsed.data, edit_version: version + 1 })
        .eq('id', id).eq('workbook_slug', slug).eq('edit_version', version).select('id').maybeSingle()
      : await client.from('engine_module_drafts').insert({ id: moduleId, workbook_slug: slug, content: parsed.data }).select('id').single();
    if (result.error) return error('Could not save the draft.');
    if (!result.data) return error(invalidVersion);
  } else {
    const saved = await changeDemoWorkbooks(state => {
      if (!state.books.some(book => book.slug === slug)) return false;
      if (!id) {
        state.modules.push({ id: moduleId, workbook_slug: slug, draft: parsed.data, edit_version: 1, published: null, revision: 0 });
        return true;
      }
      const found = state.modules.find(item => item.id === id && item.workbook_slug === slug && item.edit_version === version);
      if (!found) return false;
      found.draft = parsed.data;
      found.edit_version = version + 1;
      return true;
    });
    if (!saved) return error(invalidVersion);
  }
  revalidatePath('/content-editor');
  redirect('/content-editor?workbook=' + slug + '&module=' + moduleId + '&saved=1');
}

export async function publishModule(slug: string, id: string, version: number, _: ActionState): Promise<ActionState> {
  if (demo) {
    const saved = await changeDemoWorkbooks(state => {
      const item = state.modules.find(module => module.id === id && module.workbook_slug === slug);
      if (!item?.draft || item.edit_version !== version) return false;
      item.published = item.draft;
      item.revision = version;
      return true;
    });
    if (!saved) return error(invalidVersion);
  } else {
    const { client } = await editorAccess();
    const result = await client.rpc('publish_workbook_module', { draft_id: id, expected_version: version });
    if (result.error) return error('Could not publish the saved draft.');
    if (!result.data) return error(invalidVersion);
  }
  revalidatePath('/content-editor');
  revalidatePath('/workbooks');
  revalidatePath('/workbooks/' + slug);
  return { message: 'Module published.' };
}
