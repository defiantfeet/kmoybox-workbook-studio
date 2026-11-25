import { supabase, demo } from '../../../../lib/session';
import { growthTimezone } from '../../../../lib/becoming/data';
import { pollCentralReminders } from '../../../../lib/becoming/reminder-data';

const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: Request) {
  if (demo) return Response.json({ notices: [], browser: [] }, { headers });
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return new Response(null, { status: 403, headers });
  const client = await supabase();
  const authenticated = await client?.auth.getUser();
  const user = authenticated?.data.user;
  if (!client || !user) return new Response(null, { status: 401, headers });
  const body = await request.json().catch(() => null);
  try {
    const timezone = await growthTimezone(client, user.id);
    const result = await pollCentralReminders(client, user.id, timezone, body?.browser === true, body?.inbox === true);
    return Response.json(result, { headers });
  } catch {
    return Response.json({ notices: [], browser: [] }, { status: 503, headers });
  }
}
