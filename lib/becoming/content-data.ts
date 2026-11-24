import 'server-only';

import type { account } from '../data';
import type { ContentItem, ContentKind, ContentVersion, PublishedContent } from './content-catalog';

type Client = Awaited<ReturnType<typeof account>>['client'];

export async function publishedGrowthContent(client: Client | null): Promise<PublishedContent[]> {
  if (!client) return [];
  const { data, error } = await client.rpc('published_growth_content');
  if (error) throw new Error('Published Personal Growth content could not load.');
  return data ?? [];
}

export async function editorContent(client: Client, id: string | undefined, page: number, historyPage: number,
  filters: { kind: string; query: string; state: string }) {
  const now = new Date().toISOString();
  const size = 25;
  let listing = client.from('growth_content_current')
    .select('*', { count: 'exact' })
    .order('id').range(page * size, page * size + size - 1);
  if (filters.kind) listing = listing.eq('kind', filters.kind);
  if (filters.query) listing = listing.ilike('title', '%' + filters.query + '%');
  if (filters.state === 'scheduled') listing = listing.eq('state', 'published').gt('effective_at', now);
  else if (filters.state) {
    listing = listing.eq('state', filters.state);
    if (filters.state === 'published') listing = listing.lte('effective_at', now);
  }
  const historySize = 20;
  const [list, engagement, selected, current, history, categories] = await Promise.all([
    listing, client.rpc('growth_content_engagement'),
    id ? client.from('growth_content_items').select('id,kind,module_slug,revision').eq('id', id).maybeSingle() : null,
    id ? client.from('growth_content_current').select('*').eq('id', id).maybeSingle() : null,
    id ? client.from('growth_content_versions').select('*', { count: 'exact' }).eq('item_id', id)
      .order('revision', { ascending: false }).range(historyPage * historySize, (historyPage + 1) * historySize - 1) : null,
    publishedGrowthContent(client),
  ]);
  if (list.error || engagement.error || selected?.error || current?.error || history?.error) throw new Error('The Personal Growth Content Manager could not load.');
  const versions = (history?.data ?? []) as ContentVersion[];
  return {
    entries: (list.data ?? []).map(row => ({ ...row, kind: row.kind as ContentKind, current: { ...row, item_id: row.id } })) as ContentItem[],
    total: list.count ?? 0, size, selected: selected?.data as Omit<ContentItem, 'current'> | null,
    current: current?.data ? { ...current.data, item_id: id } as ContentVersion : undefined,
    versions, moreHistory: (history?.count ?? 0) > (historyPage + 1) * historySize, engagement: (engagement.data ?? []) as { module_slug: string; member_floor: number }[],
    categories: categories.filter(item => item.kind === 'category'),
  };
}
