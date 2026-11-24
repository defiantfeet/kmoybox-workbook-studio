'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { insightKeys, insightsPath } from './insights';

export async function saveInsightPreferences(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return { message: 'Sign in to save your preferences.', error: true };
  const { client, user } = await account(true);
  const shown = z.array(z.enum(insightKeys)).max(insightKeys.length).safeParse(form.getAll('shown'));
  if (!shown.success) return { message: 'Check your selections and try again.', error: true };
  const { error } = await client.from('notification_preferences').upsert({
    user_id: user.id, hidden_growth_insights: insightKeys.filter(key => !shown.data.includes(key)),
  }, { onConflict: 'user_id' });
  if (error) return { message: 'Your insight preferences could not be saved.', error: true };
  revalidatePath(insightsPath);
  return { message: 'Insight preferences saved.' };
}
