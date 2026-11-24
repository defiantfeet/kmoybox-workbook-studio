'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '../actions';
import { account } from '../data';
import { demo } from '../session';
import { growthDates, growthTimezone } from './data';
import { generateGrowthReport, savedGrowthReport } from './report-data';
import { reportKinds, reportPeriod, reportResponses, reportSelections, reportSnapshot, reportsPath } from './reports';

const fail = (message: string): ActionState => ({ message, error: true });
const idSchema = z.uuid();
const revisionSchema = z.iso.datetime({ offset: true });
const dateSchema = z.iso.date();

function refresh() {
  revalidatePath('/becoming');
  revalidatePath(reportsPath);
}

export async function saveGrowthReport(kind: string, start: string, id: string, version: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to save a private report.');
  const { client, user } = await account(true);
  const parsedKind = z.enum(reportKinds).safeParse(kind);
  if (!parsedKind.success || !dateSchema.safeParse(start).success || start < '1900-01-01'
    || (id && (!idSchema.safeParse(id).success || !revisionSchema.safeParse(version).success))) {
    return fail('Choose a report period before saving.');
  }

  const saved = id ? await savedGrowthReport(client, user.id, { id }) : null;
  if (id && (!saved || saved.revision !== version || saved.kind !== parsedKind.data || saved.start !== start)) {
    return fail('This report changed in another tab or is no longer available. Copy your edits before reloading.');
  }
  const timezone = saved?.timezone ?? await growthTimezone(client, user.id);
  const { today } = growthDates(timezone);
  const period = reportPeriod(parsedKind.data, start);
  if (period.start !== start || start > today) return fail('Choose a current or earlier period.');
  const categories = reportSelections.safeParse(form.getAll('category'));
  const reflections = reportResponses.safeParse(Object.fromEntries([...form.entries()].flatMap(([name, value]) =>
    name.startsWith('answer-') && typeof value === 'string' ? [[name.slice(7), value]] : [])));
  if (!categories.success || !reflections.success) return fail('Check your categories and keep each answer within 2,000 characters.');

  const through = today < period.end ? today : period.end;
  const generated = await generateGrowthReport(client, user.id, parsedKind.data, period, through, timezone, categories.data);
  const validated = reportSnapshot.safeParse(generated);
  if (!validated.success) return fail('The data summary could not be generated. Your current report is still available.');
  const fields = { data_through: through, categories: categories.data, reflections: reflections.data, snapshot: validated.data };
  const table = client.from('growth_reports');
  const result = id
    ? await table.update(fields).eq('id', id).eq('user_id', user.id).eq('updated_at', version).select('id').maybeSingle()
    : await table.insert({ ...fields, user_id: user.id, kind, period_start: period.start, period_end: period.end, timezone }).select('id').single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) return fail('A report changed in another tab. Copy your edits before reloading.');
  if (result.error) return fail('Your report could not be saved. Try again.');
  refresh();
  redirect(reportsPath + '?kind=' + kind + '&day=' + start + '&saved=1#report-heading');
}

export async function deleteGrowthReport(id: string, version: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (demo || !idSchema.safeParse(id).success || !revisionSchema.safeParse(version).success || form.get('confirm') !== 'yes') {
    return fail('Confirm deletion to remove this report.');
  }
  const { client, user } = await account(true);
  const result = await client.from('growth_reports').delete().eq('id', id).eq('user_id', user.id)
    .eq('updated_at', version).select('kind,period_start').maybeSingle();
  if (result.error || !result.data) return fail('This report could not be deleted or changed in another tab.');
  refresh();
  redirect(reportsPath + '?kind=' + result.data.kind + '&day=' + result.data.period_start + '&deleted=1#report-heading');
}

export async function saveReportReminders(_: ActionState, form: FormData): Promise<ActionState> {
  if (demo) return fail('Sign in to save reminder preferences.');
  const { client, user } = await account(true);
  const { error } = await client.from('notification_preferences').upsert({
    user_id: user.id, weekly_growth_report_reminder: form.get('weekly') === 'yes',
    monthly_growth_report_reminder: form.get('monthly') === 'yes',
  }, { onConflict: 'user_id' });
  if (error) return fail('Your reminder preferences could not be saved.');
  refresh();
  return { message: 'Report reminder preferences saved.' };
}
