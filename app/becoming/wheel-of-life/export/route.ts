import { account } from '../../../../lib/data';
import { wheelAssessments } from '../../../../lib/becoming/data';
import { demo } from '../../../../lib/session';

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (demo) return new Response(null, { status: 404, headers });
  const { client, user } = await account();
  try {
    const assessments = await wheelAssessments(client, user.id, true);
    return Response.json({ formatVersion: 1, assessments }, {
      headers: { ...headers, 'Content-Disposition': 'attachment; filename="wheel-of-life-reflections.json"' },
    });
  } catch {
    return new Response('Your reflections could not be exported.', { status: 500, headers });
  }
}
