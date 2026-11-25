import 'server-only';

import type { account } from '../data';
import { growthHabits } from './data';
import { addDays, isScheduled } from './habits';
import { isQuiet, moodSettingsSchema, moodSlots } from './mood';
import { defaultReminderSettings, previousReminderPeriod, recurrenceKey, reminderClock, reminderKeys,
  reminderSettingsSchema, type ReminderType, type ReminderNotice } from './reminders';
import { localWheelDate, nextWheelReminder } from './wheel';

type Client = Awaited<ReturnType<typeof account>>['client'];

async function read<T>(request: PromiseLike<{ data: T; error: unknown }>) {
  const result = await request;
  if (result.error) throw new Error('Your reminder settings or activity could not be loaded.');
  return result.data;
}

export async function centralRemindersActive(client: Client | null, owner: string) {
  if (!client) return false;
  const row = await read(client.from('notification_preferences').select('central_reminders').eq('user_id', owner).maybeSingle());
  return Boolean(row?.central_reminders);
}

export async function reminderPreferences(client: Client | null, owner: string) {
  const settings = defaultReminderSettings();
  if (!client) return { settings, pausedUntil: null, configured: false };
  const row = await read(client.from('notification_preferences').select('central_reminders,reminders_paused_until,mood_preferences,weekly_reflection_enabled,weekly_reflection_time,wheel_reminder_since,weekly_growth_report_reminder,monthly_growth_report_reminder')
    .eq('user_id', owner).maybeSingle());
  const stored = reminderSettingsSchema.safeParse(row?.central_reminders);
  if (stored.success) return { settings: stored.data, pausedUntil: row?.reminders_paused_until ?? null, configured: true };

  const mood = moodSettingsSchema.safeParse(row?.mood_preferences);
  if (mood.success) for (const slot of moodSlots) {
    const time = mood.data.times[slot];
    if (time) settings.rules[slot] = { ...settings.rules[slot], time, enabled: mood.data.reminders && mood.data.days.length > 0 };
  }
  if (mood.success) {
    settings.quietStart = mood.data.quietStart;
    settings.quietEnd = mood.data.quietEnd;
  }
  const habit = await read(client.from('growth_habits').select('id,preferred_time').eq('user_id', owner)
    .eq('reminder', true).is('archived_on', null).eq('paused', false).order('preferred_time').order('id').limit(1).maybeSingle());
  if (habit) {
    settings.rules.habits.enabled = true;
    settings.rules.habits.time = habit.preferred_time ?? settings.rules.habits.time;
  }
  settings.rules.weekly.enabled = Boolean(row?.weekly_reflection_enabled);
  if (row?.weekly_reflection_time) settings.rules.weekly.time = row.weekly_reflection_time.slice(0, 5);
  settings.rules.wheel.enabled = Boolean(row?.wheel_reminder_since);
  settings.rules.weeklyReport.enabled = Boolean(row?.weekly_growth_report_reminder);
  settings.rules.monthlyReport.enabled = Boolean(row?.monthly_growth_report_reminder);
  settings.rules.future.enabled = true;
  settings.rules.boundary.enabled = true;
  return { settings, pausedUntil: row?.reminders_paused_until ?? null, configured: false };
}

export async function pollCentralReminders(client: Client, owner: string, timezone: string,
  browserReady: boolean, includeBrowserInbox: boolean, moment = new Date()) {
  const empty = { notices: [] as (ReminderNotice & { snoozed_until: string | null })[], browser: [] as ReminderNotice[] };
  const row = await read(client.from('notification_preferences').select('central_reminders,reminders_paused_until,mood_preferences')
    .eq('user_id', owner).maybeSingle());
  const config = reminderSettingsSchema.safeParse(row?.central_reminders);
  if (!config.success || !config.data.enabled || (row?.reminders_paused_until && Date.parse(row.reminders_paused_until) > moment.valueOf())) return empty;
  const { rules, quietStart, quietEnd } = config.data;
  const clock = reminderClock(moment, timezone);
  if (isQuiet(clock.time, quietStart, quietEnd)) return empty;
  const { day, monday } = clock;
  const moodSchedule = moodSettingsSchema.safeParse(row?.mood_preferences);

  const moodRows = moodSlots.some(slot => rules[slot].enabled) ? read(client.from('growth_check_ins').select('slot')
    .eq('user_id', owner).eq('local_date', day).in('slot', [...moodSlots])) : null;

  async function datedGoal(type: 'goals' | 'social') {
    const query = type === 'social'
      ? client.from('goals').select('target_date,social:social_goals!social_goals_goal_id_user_id_fkey!inner(status)')
        .eq('social.status', 'Active')
      : client.from('goals').select('target_date,inactive:social_goals!social_goals_goal_id_user_id_fkey()')
        .in('inactive.status', rules.social.enabled ? ['Active','Postponed','Declined','Completed'] : ['Postponed','Declined']).is('inactive', null);
    query.eq('user_id', owner).eq('completed', false);
    if (rules[type].frequency === 'due') query.gte('target_date', addDays(day, -7)).lte('target_date', day);
    const match = await read(query.order('target_date', { ascending: false, nullsFirst: false }).order('id').limit(1).maybeSingle());
    return match ? rules[type].frequency === 'due' ? match.target_date : day : null;
  }

  const matchType = async (kind: ReminderType): Promise<string | null> => {
    if (!rules[kind].enabled) return null;
    switch (kind) {
      case 'morning': case 'midday': case 'afternoon': case 'evening':
        if (moodSchedule.success && (!moodSchedule.data.days.includes(clock.weekday) || !moodSchedule.data.times[kind])) return null;
        return (await moodRows)?.some(item => item.slot === kind) ? null : day;
      case 'habits': {
        const data = await growthHabits(client, owner, day, day);
        const found = new Set(data.logs.map(item => item.habit_id));
        return data.habits.some(item => !item.archived_on && isScheduled(item, day) && !found.has(item.id)) ? day : null;
      }
      case 'goals': case 'social': return datedGoal(kind);
      case 'weekly': {
        const done = await read(client.from('growth_weekly_reflections').select('id')
          .eq('user_id', owner).eq('week_start', monday).maybeSingle());
        return done ? null : monday;
      }
      case 'wheel': {
        const last = await read(client.from('growth_exercises').select('completed_at').eq('user_id', owner)
          .eq('module_slug', 'wheel-of-life').not('completed_at', 'is', null)
          .order('completed_at', { ascending: false }).order('id').limit(1).maybeSingle());
        if (!last?.completed_at) return day;
        const lastDay = localWheelDate(last.completed_at, timezone);
        if (rules[kind].frequency === 'due') {
          const due = nextWheelReminder(lastDay, last.completed_at, timezone);
          return due && due <= day ? (due >= addDays(day, -60) ? due : day.slice(0, 7) + '-01') : null;
        }
        const period = rules[kind].frequency === 'monthly' ? day.slice(0,7) + '-01' : rules[kind].frequency === 'weekly' ? monday : day;
        return lastDay < period ? day : null;
      }
      case 'future': case 'boundary': {
        const future = kind === 'future';
        const field = future ? 'reflectionDate' : 'followUpDate';
        const query = client.from('growth_exercises').select('due:answers->>' + field).eq('user_id', owner)
          .eq('module_slug', future ? 'future-self-visualization' : 'boundary-builder')
          .eq('answers->>format', future ? 'future-v1' : 'boundary-v1').not('completed_at', 'is', null);
        if (future && rules[kind].frequency !== 'due') query.neq('answers->>letter', '');
        if (rules[kind].frequency === 'due') query.gte('answers->>' + field, addDays(day, -30)).lte('answers->>' + field, day);
        const match = await read(query.order('answers->>' + field, { ascending: false }).order('id').limit(1).maybeSingle());
        return match ? rules[kind].frequency === 'due' ? (match as unknown as { due: string }).due : day : null;
      }
      case 'weeklyReport': case 'monthlyReport': {
        const start = previousReminderPeriod(kind, day);
        const saved = await read(client.from('growth_reports').select('id').eq('user_id', owner)
          .eq('kind', kind === 'weeklyReport' ? 'weekly' : 'monthly').eq('period_start', start).maybeSingle());
        return saved ? null : start;
      }
    }
  };

  const due = await Promise.all(reminderKeys.map(async kind => ({ kind, due: await matchType(kind) })));
  const eligible = new Set(due.filter(item => item.due !== null).map(item => item.kind));
  const candidates = due.flatMap(item => {
    const occurrence = recurrenceKey(rules[item.kind], clock, item.due);
    return occurrence ? [{ kind: item.kind, occurrence }] : [];
  });
  const result = await read(client.rpc('refresh_central_reminders', {
    candidates, browser_ready: browserReady, include_browser_inbox: includeBrowserInbox,
  })) as typeof empty;
  return { notices: result.notices.filter(item => eligible.has(item.type)), browser: result.browser.filter(item => eligible.has(item.type)) };
}
