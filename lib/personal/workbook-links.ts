import type { StudioData, WorkbookLink } from '../model';
import { account } from '../data';
import { demo } from '../session';
import { readDemoWorkbooks } from '../workbooks/demo-store';
import type { ModuleContent, ModuleProgress } from '../workbooks/schema';

export async function workbookLinks(data: StudioData, responsesOnly: boolean): Promise<WorkbookLink[]> {
  const legacy = data.prompts.flatMap(prompt => {
    const product = data.products.find(item => item.slug === prompt.product_slug);
    if (!product || (!product.free && !data.purchased.includes(product.slug))
      || (responsesOnly && !data.answers.some(answer => answer.prompt_id === prompt.id))) return [];
    return [{ ref: 'legacy:' + prompt.id, label: product.title + ' — ' + prompt.title,
      href: '/workbooks/' + product.slug + '#exercise-' + prompt.id }];
  });
  let books: { slug: string; title: string }[];
  let modules: { id: string; workbook_slug: string; content: ModuleContent }[];
  let responses: Pick<ModuleProgress, 'module_id' | 'answers'>[];
  if (demo) {
    const state = await readDemoWorkbooks();
    books = state.books;
    modules = state.modules.flatMap(item => item.published ? [{ ...item, content: item.published }] : []);
    responses = state.progress;
  } else {
    const { client, user } = await account();
    const [catalog, content, saved] = await Promise.all([
      client.from('engine_workbooks').select('slug,title'),
      client.from('engine_modules').select('id,workbook_slug,content'),
      responsesOnly ? client.from('engine_progress').select('module_id,answers').eq('user_id', user.id) : Promise.resolve({ data: [], error: null }),
    ]);
    if (catalog.error || content.error || saved.error) throw new Error('Workbook connections could not load.');
    books = catalog.data ?? [];
    modules = content.data ?? [];
    responses = saved.data ?? [];
  }
  return legacy.concat(modules.flatMap(module => {
    const book = books.find(item => item.slug === module.workbook_slug);
    const answers = responses.find(item => item.module_id === module.id)?.answers ?? {};
    if (!book) return [];
    return module.content.blocks.flatMap(block => block.kind === 'lesson' || (responsesOnly && !Object.hasOwn(answers, block.id)) ? [] : [{
      ref: 'engine:' + module.id + ':' + block.id,
      label: book.title + ' — ' + block.prompt,
      href: '/workbooks/' + book.slug + '?module=' + module.id + '#exercise-' + block.id,
    }]);
  }));
}
