'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { readTimeline, timelineImageLimit, timelinePath } from './timeline';

const error = (message: string): ActionState => ({ message, error: true });
const validRecord = (id: string, revision: string) => z.uuid().safeParse(id).success && z.iso.datetime({ offset: true }).safeParse(revision).success;

function imageType(data: Buffer) {
  if (data.length < 12) return null;
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function saveTimeline(id: string, revision: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save a private event.');
  const { client } = await account(true);
  if (id && !validRecord(id, revision)) return error('Reopen this event before saving.');
  const raw = form.get('event');
  let decoded: unknown;
  if (typeof raw === 'string' && Buffer.byteLength(raw, 'utf8') < 60000) {
    try { decoded = JSON.parse(raw); } catch { decoded = null; }
  }
  const event = readTimeline(decoded);
  if (!event) return error('Enter an event title and check the date, age range, or field limits.');

  const file = form.get('image');
  let bytes: Buffer | null = null;
  let mime: string | null = null;
  if (file instanceof File && file.size) {
    if (file.size > timelineImageLimit) return error('Choose an image no larger than 512 KB.');
    bytes = Buffer.from(await file.arrayBuffer());
    mime = imageType(bytes);
    if (!mime) return error('Choose a PNG, JPEG, or WebP image.');
  }

  const result = await client.rpc('save_timeline_event', {
    entry_id: id || null, expected_revision: revision || null, event_answers: event,
    image_data: bytes?.toString('base64') ?? null, image_type: mime, remove_image: form.get('removeImage') === 'yes',
  });
  if (result.error?.code === '40001') return error('This event changed in another tab. Copy your edits before reloading.');
  if (result.error || !result.data) return error('Your event could not be saved. Try again.');
  revalidatePath(timelinePath);
  revalidatePath('/becoming');
  redirect(timelinePath + '?event=' + result.data + '&saved=1#timeline-editor');
}

export async function deleteTimeline(id: string, revision: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo || !validRecord(id, revision)) return error('Reopen this event before deleting.');
  if (form.get('confirm') !== 'yes') return error('Confirm deletion to remove this event.');
  const { client, user } = await account(true);
  const result = await client.from('growth_exercises').delete().eq('id', id).eq('user_id', user.id)
    .eq('module_slug', 'life-timeline').eq('answers->>format', 'timeline-v1').eq('updated_at', revision).select('id').maybeSingle();
  if (result.error || !result.data) return error('This event could not be deleted or changed in another tab.');
  revalidatePath(timelinePath);
  revalidatePath('/becoming');
  redirect(timelinePath + '?deleted=1#timeline-events');
}
