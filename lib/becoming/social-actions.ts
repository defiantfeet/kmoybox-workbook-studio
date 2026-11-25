'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { growthDates, growthTimezone } from './data';
import { communityIdeas, socialCircles, socialGoalStatuses, socialKeys, socialPath, socialPrompts, socialScenarios } from './social';

const error = (message: string): ActionState => ({ message, error: true });
const get = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
};
const stamp = z.iso.datetime({ offset: true });
const date = z.iso.date();

export async function saveSocial(kind: string, key: string, id: string, revision: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return error('Sign in to save private social reflections.');
  const { client, user } = await account(true);
  if (id && (!z.uuid().safeParse(id).success || !stamp.safeParse(revision).success)) return error('Reopen this entry and try again.');

  const now = new Date().toISOString();
  const fields = Object.fromEntries([...form.entries()].flatMap(([name, value]) =>
    !name.startsWith('field-') || typeof value !== 'string' ? [] : [[name.slice(6), value.trim()]]));
  let allowed: string[];
  switch (kind) {
    case 'ecosystem':
      allowed = socialCircles.flatMap((_, index) => ['label' + index, 'notes' + index]);
      break;
    case 'progress':
      allowed = socialKeys;
      for (const section of socialKeys) if (fields[section] === '') delete fields[section];
      break;
    case 'practice':
      if (!socialScenarios.some((_, index) => String(index) === key)) return error('Choose a practice scenario.');
      allowed = socialPrompts.practice.map((_, index) => String(index));
      break;
    case 'weekly': {
      const { monday } = growthDates(await growthTimezone(client, user.id));
      if (!date.safeParse(key).success || key > monday || (!id && key !== monday)) return error('Choose the current week before saving.');
      allowed = socialPrompts.weekly.map((_, index) => String(index));
      break;
    }
    case 'community':
      if (fields.idea && !communityIdeas.some(idea => idea === fields.idea)) return error('Choose an activity type from the list.');
      allowed = ['idea', ...socialPrompts.community.map((_, index) => String(index))];
      break;
    case 'goals': {
      const title = get(form, 'title');
      const target = get(form, 'target');
      const notes = get(form, 'notes');
      const status = z.enum(socialGoalStatuses).safeParse(get(form, 'status'));
      if (!title || title.length > 140 || notes.length > 2000 || !status.success || (target && !date.safeParse(target).success)) {
        return error('Enter a goal and check the details.');
      }
      const { error: failure } = await client.rpc('save_social_goal', {
        entry_id: id || null, expected_revision: revision || null, goal_title: title,
        target_day: target || null, goal_status: status.data, private_notes: notes,
      });
      if (failure) return error(failure.code === '40001' ? 'This goal changed in another tab. Copy your edits before reloading.' : 'Could not save your social goal.');
      revalidatePath(socialPath);
      revalidatePath('/becoming');
      revalidatePath('/goals');
      return { message: 'Social goal saved.' };
    }
    case 'awareness':
    case 'expectations':
    case 'journal':
      allowed = socialPrompts[kind].map((_, index) => String(index));
      break;
    default:
      return error('Choose a social exercise before saving.');
  }

  if (kind === 'progress' && Object.values(fields).some(value => value !== 'yes')) return error('Check your progress selections.');
  if (Object.entries(fields).some(([name, value]) => !allowed.includes(name) || value.length > (name.startsWith('label') ? 50 : 2000))) {
    return error('Check the field limits and try again.');
  }
  if (kind === 'journal') {
    const occurredOn = get(form, 'day');
    const { today } = growthDates(await growthTimezone(client, user.id));
    if (!fields['0'] || !date.safeParse(occurredOn).success || occurredOn > today) return error('Enter an activity and a valid date up to today.');
    const table = client.from('social_interactions');
    const payload = { local_date: occurredOn, details: fields, updated_at: now };
    const result = id ? await table.update(payload).eq('id', id).eq('user_id', user.id).eq('updated_at', revision).select('id').maybeSingle()
      : await table.insert({ ...payload, user_id: user.id }).select('id').single();
    if (result.error || !result.data) return error('Could not save this interaction. If it changed in another tab, copy your edits before reloading.');
    revalidatePath(socialPath);
    return { message: 'Interaction saved.' };
  }

  if (!Object.values(fields).some(Boolean) && kind !== 'progress' && kind !== 'ecosystem' && !id) {
    return error('Write at least one response before saving.');
  }
  const table = client.from('growth_exercises');
  const answers = { format: 'social-v1', kind, key, fields };
  const result = id
    ? await table.update({ answers, updated_at: now }).eq('user_id', user.id).eq('module_slug', 'social-integration')
      .eq('answers->>format', 'social-v1').eq('answers->>kind', kind).eq('answers->>key', key)
      .eq('id', id).eq('updated_at', revision).select('id').maybeSingle()
    : await table.insert({ user_id: user.id, module_slug: 'social-integration', answers, updated_at: now, is_current: false }).select('id').single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) return error('This entry changed in another tab. Copy your edits before reloading.');
  if (result.error) return error('Could not save this entry. Try again.');
  revalidatePath(socialPath);
  return { message: kind === 'progress' ? 'Progress preferences saved.' : 'Private entry saved.' };
}
