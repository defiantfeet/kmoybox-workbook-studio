import { account } from '../data';
import { demo } from '../session';

type Purchase = {
  id: string; workbook_slug: string; title: string; amount: number; currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'revoked';
  refunded_amount: number; created_at: string;
};

export async function purchaseHistory(): Promise<Purchase[]> {
  if (demo) return [];
  const { client, user } = await account();
  const { data, error } = await client.from('workbook_purchases')
    .select('id,workbook_slug,title,amount,currency,status,refunded_amount,created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).order('id');
  if (error) throw new Error('Purchase history could not load.');
  return (data ?? []) as Purchase[];
}
