import { z } from 'zod';
import { account } from '../../../../../lib/data';
import { demo } from '../../../../../lib/session';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success || demo) return new Response(null, { status: 404, headers });
  const { client, user } = await account();
  const result = await client.from('timeline_images').select('mime_type,content').eq('event_id', id.data)
    .eq('user_id', user.id).maybeSingle();
  const image = result.data;
  if (!image || typeof image.content !== 'string' || !image.content.startsWith('\\x')) {
    return new Response(null, { status: 404, headers });
  }
  return new Response(new Uint8Array(Buffer.from(image.content.slice(2), 'hex')), {
    headers: { ...headers, 'Content-Type': image.mime_type, 'Content-Security-Policy': "default-src 'none'; sandbox" },
  });
}
