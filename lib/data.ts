import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { demo, supabase } from './session';
import { demoData } from './demo';
import type { StudioData } from './model';

export async function demoSnapshot(): Promise<StudioData> {
  const jar = await cookies();
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
    answers: rows('studio-answers', demoData.answers),
    journal: rows('studio-journal', demoData.journal),
    goals: rows('studio-goals', demoData.goals),
  };
}

export async function account(writable = false) {
  const client = await supabase(writable);
  if (!client) redirect('/login');
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');
  return { client, user };
}

export async function studio() {
  if (demo) return { data: await demoSnapshot(), name: 'Alex' };
  const { client, user } = await account();
  const [products, prompts, entitlements, answers, journal, goals] = await Promise.all([
    client.from('products').select('slug,title,summary,free').order('free', { ascending: false }).order('slug'),
    client.from('prompts').select('id,product_slug,position,title,question').order('position'),
    client.from('entitlements').select('product_slug'),
    client.from('responses').select('prompt_id,body,completed'),
    client.from('journal_entries').select('id,title,body,created_at').order('created_at', { ascending: false }),
    client.from('goals').select('id,title,target_date,completed').order('completed').order('target_date'),
  ]);
  if ([products, prompts, entitlements, answers, journal, goals].some(result => result.error)) {
    throw new Error('The studio could not load. Please try again.');
  }
  const data: StudioData = {
    products: products.data ?? [], prompts: prompts.data ?? [],
    purchased: entitlements.data?.map(row => row.product_slug) ?? [],
    answers: answers.data ?? [], journal: journal.data ?? [], goals: goals.data ?? [],
  };
  const name = typeof user.user_metadata.display_name === 'string' ? user.user_metadata.display_name.trim().split(/\s+/)[0] : '';
  return { data, name };
}
