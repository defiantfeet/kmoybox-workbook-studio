import { account } from '../../../../lib/data';
import { demo } from '../../../../lib/session';

const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET() {
  if (demo) return new Response('Sign in to export your check-ins.', { status: 404, headers: privateHeaders });
  const { client, user } = await account();
  const entries: unknown[] = [];
  for (let offset = 0; ; offset += 250) {
    const { data, error } = await client.from('growth_check_ins')
      .select('id,local_date,slot,occurred_at,timezone,mood,mood_rating,energy_rating,emotion_labels,note,details,context_tags')
      .eq('user_id', user.id).order('local_date').order('occurred_at').order('id').range(offset, offset + 249);
    if (error) return new Response('Your export could not be created.', { status: 500, headers: privateHeaders });
    entries.push(...(data ?? []));
    if (!data || data.length < 250) break;
  }
  return new Response(JSON.stringify({ formatVersion: 1, exportedAt: new Date().toISOString(), entries }, null, 2), {
    headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="kmoybox-mood-check-ins.json"' },
  });
}
