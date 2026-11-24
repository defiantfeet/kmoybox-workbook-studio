import { notFound } from 'next/navigation';
import { account } from '../data';
import { demo } from '../session';
import { readDemoWorkbooks } from './demo-store';
import { ordered, type ModuleContent, type ModuleProgress, type ModuleRecord, type WorkbookOffer, type WorkbookRecord } from './schema';

export async function editorAccess() {
  const session = await account();
  const { data, error } = await session.client.from('workbook_editor_accounts').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (error) throw new Error('Editor access could not be checked.');
  if (!data) notFound();
  return session;
}

export async function workbookLibrary(): Promise<WorkbookOffer[]> {
  if (demo) {
    const { books, modules } = await readDemoWorkbooks();
    return books.filter(book => modules.some(item => item.workbook_slug === book.slug && item.published))
      .map(book => ({ ...book, requires_purchase: false, unlocked: true, owned: false, amount: null, currency: null }));
  }
  const { client } = await account();
  const { data, error } = await client.rpc('workbook_storefront');
  if (error) throw new Error('The workbook library could not load.');
  return ((data ?? []) as WorkbookOffer[]).filter(book => !book.sample);
}

export async function publishedWorkbook(slug: string) {
  let book: WorkbookRecord | undefined;
  let modules: { id: string; content: ModuleContent; revision: number }[];
  let responses: ModuleProgress[];
  if (demo) {
    const state = await readDemoWorkbooks();
    book = state.books.find(item => item.slug === slug);
    modules = state.modules.flatMap(item => item.workbook_slug === slug && item.published
      ? [{ id: item.id, content: item.published, revision: item.revision }] : []);
    responses = state.progress;
  } else {
    const { client, user } = await account();
    const access = await client.rpc('engine_can_read_workbook', { book_slug: slug });
    if (access.error) throw new Error('Workbook access could not be checked.');
    if (access.data !== true) return null;
    const { data, error } = await client.from('engine_workbooks')
      .select('slug,title,summary,sample,engine_modules(id,content,revision)').eq('slug', slug).maybeSingle();
    if (error) throw new Error('The workbook could not load.');
    if (!data || data.sample) return null;
    book = data;
    modules = data.engine_modules;
    if (!modules.length) return null;
    const { data: rows, error: responseError } = await client.from('engine_progress')
      .select('module_id,revision,answers,completed,updated_at').eq('user_id', user.id).in('module_id', modules.map(item => item.id));
    if (responseError) throw new Error('Saved workbook responses could not load.');
    responses = rows ?? [];
  }
  if (!book || !modules.length) return null;
  return {
    book,
    modules: ordered(modules).map(item => {
      const saved = responses.find(response => response.module_id === item.id);
      return { ...item, answers: saved?.answers ?? {}, updatedAt: saved?.updated_at, completed: !!saved?.completed && saved.revision === item.revision };
    }),
  };
}

export async function editorLibrary() {
  if (demo) return readDemoWorkbooks();
  const { client } = await editorAccess();
  const [books, drafts, published] = await Promise.all([
    client.from('engine_workbooks').select('slug,title,summary,sample').order('title'),
    client.from('engine_module_drafts').select('id,workbook_slug,content,edit_version'),
    client.from('engine_modules').select('id,content,revision'),
  ]);
  if (books.error || drafts.error || published.error) throw new Error('The workbook editor could not load.');
  const modules: ModuleRecord[] = (drafts.data ?? []).map(draft => {
    const version = published.data?.find(item => item.id === draft.id);
    return { id: draft.id, workbook_slug: draft.workbook_slug, draft: draft.content, edit_version: draft.edit_version,
      published: version?.content ?? null, revision: version?.revision ?? 0 };
  });
  return { books: (books.data ?? []) as WorkbookRecord[], modules };
}

export async function canEditWorkbooks() {
  if (demo) return true;
  const { client, user } = await account();
  const { data } = await client.from('workbook_editor_accounts').select('user_id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

export async function completedModuleCount() {
  if (demo) {
    const { modules, progress } = await readDemoWorkbooks();
    return progress.filter(item => item.completed && modules.some(module =>
      module.id === item.module_id && module.published && module.revision === item.revision)).length;
  }
  const { client, user } = await account();
  const { data, error } = await client.from('engine_progress').select('revision,engine_modules!inner(revision)')
    .eq('user_id', user.id).eq('completed', true);
  if (error) throw new Error('Workbook progress could not load.');
  return (data ?? []).filter(item => item.revision === (item.engine_modules as unknown as { revision: number }).revision).length;
}
