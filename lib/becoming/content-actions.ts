'use server';

import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { demo } from '../session';
import { editorAccess } from '../workbooks/repository';
import { findModule } from './catalog';
import { contentEditorPath, contentKinds, type ContentKind } from './content-catalog';

export async function saveGrowthContent(id: string | null, revision: number, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo) notFound();
  const { client } = await editorAccess();
  const schema = z.object({
    kind: z.enum(Object.keys(contentKinds) as ContentKind[]),
    target: z.string().refine(value => !value || Boolean(findModule(value))),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().max(8000),
    category: z.string().trim().max(120),
    action: z.enum(['draft', 'published', 'scheduled', 'archived']),
    schedule: z.union([z.literal(''), z.iso.datetime({ local: true }).refine(value => !value.endsWith('Z'))]),
  });
  const parsed = schema.safeParse(Object.fromEntries(['kind','target','title','body','category','action','schedule']
    .map(key => [key, form.get(key)])));
  const fail = (message: string): ActionState => ({ error: true, message });
  if (!parsed.success || (id && !z.uuid().safeParse(id).success)) return fail('Check the title, destination, content, and publish date.');
  const value = parsed.data;
  if (value.kind === 'availability' && !value.target) return fail('Choose a module for this availability setting.');
  if (!['availability','category'].includes(value.kind) && !value.body) return fail('Enter the content members will see.');
  const scheduled = value.action === 'scheduled' && value.schedule ? value.schedule + 'Z' : null;
  if (value.action === 'scheduled' && !(scheduled && Date.parse(scheduled) > Date.now()))
    return fail('Enter a future UTC publish date and time.');
  const { data, error } = await client.rpc('save_growth_content', {
    item: id, expected: revision, content_kind: value.kind, target: value.target || null,
    heading: value.title, copy: value.body, category_name: value.category, enabled: form.get('available') === 'on',
    stage: value.action === 'scheduled' ? 'published' : value.action,
    scheduled,
  });
  if (error?.code === '40001') return fail('This item changed. Reload it before saving again.');
  if (error?.code === '23505') return fail('This module already has an availability setting. Edit that item instead.');
  if (error || !data) return fail('The content change could not be saved.');
  redirect(contentEditorPath + '?item=' + data + '&saved=1');
}
