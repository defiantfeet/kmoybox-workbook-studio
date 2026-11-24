import { findModule } from '../../../lib/becoming/catalog';
import { demo, supabase } from '../../../lib/session';

export async function POST(request: Request) {
  const respond = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return respond(403);
  if (demo) return respond(204);
  const client = await supabase();
  const session = await client?.auth.getUser();
  if (!client || !session?.data.user) return respond(401);
  const body = await request.json().catch(() => null);
  if (typeof body?.module !== 'string' || !findModule(body.module)) return respond(400);
  try {
    const { error } = await client.rpc('record_growth_module_visit', { target: body.module });
    return respond(error ? 503 : 204);
  } catch {
    return respond(503);
  }
}
