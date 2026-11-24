import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { demo, supabase } from './session';
import { readDemoWorkbooks } from './workbooks/demo-store';
import { sampleData } from './demo';
import { studioDay, type StudioData } from './model';

export async function demoSnapshot(now = studioDay(new Date())): Promise<StudioData> {
  if (!demo) throw new Error('Demo data is only available in demo mode.');
  const jar = await cookies();
  const demoData = sampleData(now);
  const saved = await readDemoWorkbooks();
  function rows<T>(key: string, fallback: T[]): T[] {
    const stored = jar.get(key)?.value;
    if (!stored) return fallback;
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return {
    ...demoData,
    answers: saved.legacyAnswers ?? rows('studio-answers', demoData.answers),
    journal: saved.journal ?? rows('studio-journal', demoData.journal),
    goals: saved.goals ?? rows('studio-goals', demoData.goals),
    milestones: saved.milestones ?? [], activity: saved.activity ?? [],
  };
}

export async function account(writable = false) {
  const client = await supabase(writable);
  if (!client) redirect('/login');
  const { data: { user }, error } = await client.auth.getUser();
  if (error && (error.status === undefined || error.status === 0 || error.status === 429 || error.status >= 500)) {
    console.error('Studio authentication request failed', { code: error.code ?? 'request_failed' });
    throw new Error('The studio could not verify your sign-in. Please try again.');
  }
  if (!user) redirect('/login');
  return { client, user };
}

async function readPages<T>(read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const page = await read(start, start + pageSize - 1);
    if (page.error || !page.data) return { data: null, error: page.error ?? new Error('Rows unavailable.') };
    rows.push(...page.data);
    if (page.data.length < pageSize) return { data: rows, error: null };
  }
}

export async function studio(now = studioDay(new Date())) {
  if (demo) return { data: await demoSnapshot(now), name: 'Alex', displayName: 'Alex Morgan', email: 'alex@example.com' };
  const { client, user } = await account();
  const [products, prompts, entitlements, answers, journal, goals, milestones, activity, profile] = await Promise.all([
    client.from('products').select('slug,title,summary,free').eq('sample', false).order('free', { ascending: false }).order('slug'),
    client.from('prompts').select('id,product_slug,position,title,question').order('position'),
    readPages((start, end) => client.from('entitlements').select('product_slug').eq('user_id', user.id)
      .order('product_slug').range(start, end)),
    readPages((start, end) => client.from('responses').select('prompt_id,body,completed').eq('user_id', user.id)
      .order('prompt_id').range(start, end)),
    readPages((start, end) => client.from('journal_entries').select('id,title,body,created_at,updated_at,mood,workbook_ref').eq('user_id', user.id)
      .order('created_at', { ascending: false }).order('id').range(start, end)),
    readPages((start, end) => client.from('goals').select('id,title,target_date,completed,workbook_ref,created_at').eq('user_id', user.id)
      .order('completed').order('target_date').order('id').range(start, end)),
    readPages((start, end) => client.from('goal_milestones').select('id,goal_id,title,completed,created_at').eq('user_id', user.id)
      .order('created_at').order('id').range(start, end)),
    readPages((start, end) => client.from('goal_activity').select('id,goal_id,kind,title,created_at').eq('user_id', user.id)
      .order('created_at', { ascending: false }).order('id').range(start, end)),
    client.from('profiles').select('display_name').eq('id', user.id).single(),
  ]);
  const results = { products, prompts, entitlements, answers, journal, goals, milestones, activity, profile };
  const failures = Object.entries(results).flatMap(([source, { error }]) => {
    if (!error) return [];
    const code = typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'request_failed';
    return [{ source, code }];
  });
  if (failures.length) {
    console.error('Studio data request failed', failures);
    throw new Error('The studio could not load. Please try again.');
  }
  const visibleProducts = new Set(products.data?.map(product => product.slug));
  const data: StudioData = {
    products: products.data ?? [], prompts: prompts.data ?? [],
    purchased: entitlements.data?.flatMap(row => visibleProducts.has(row.product_slug) ? [row.product_slug] : []) ?? [],
    answers: answers.data ?? [], journal: journal.data ?? [], goals: goals.data ?? [], milestones: milestones.data ?? [], activity: activity.data ?? [],
  };
  const displayName = profile.data?.display_name ?? '';
  return { data, name: displayName.split(/\s+/)[0], displayName, email: user.email };
}
