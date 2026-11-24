import 'server-only';

import type { account } from '../data';
import { growthHabits } from './data';
import { addDays, adherence, dateRange } from './habits';
import { insightDayStart } from './insights';
import { average } from './mood';
import { reportPeriod, reportResponses, reportSelections, reportSnapshot, type ReportCategory, type ReportKind,
  type ReportPeriod, type ReportSection, type ReportSnapshot, type SavedReport } from './reports';

type Client = Awaited<ReturnType<typeof account>>['client'];

async function read<T>(request: PromiseLike<{ data: T; error: unknown }>) {
  const result = await request;
  if (result.error) throw new Error('Your private growth report could not be loaded.');
  return result.data;
}

async function pages<T>(load: (from: number, through: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const items: T[] = [];
  for (let start = 0; ; start += 250) {
    const page = await read(load(start, start + 249)) ?? [];
    items.push(...page);
    if (page.length < 250) return items;
  }
}

const selectReport = 'id,kind,period_start,period_end,timezone,data_through,updated_at,categories,reflections,snapshot';

export async function savedGrowthReport(client: Client | null, owner: string, lookup: { id: string } | { kind: ReportKind; start: string }): Promise<SavedReport | null> {
  if (!client) return null;
  const query = client.from('growth_reports').select(selectReport).eq('user_id', owner);
  const row = await read(('id' in lookup ? query.eq('id', lookup.id) :
    query.eq('kind', lookup.kind).eq('period_start', lookup.start)).maybeSingle());
  if (!row) return null;
  const parsed = reportSnapshot.safeParse(row.snapshot);
  const categories = reportSelections.safeParse(row.categories);
  const reflections = reportResponses.safeParse(row.reflections);
  if (!parsed.success || !categories.success || !reflections.success) throw new Error('Your saved report could not be read.');
  return { id: row.id, kind: row.kind, start: row.period_start, end: row.period_end, timezone: row.timezone,
    through: row.data_through, revision: row.updated_at, categories: categories.data, reflections: reflections.data, snapshot: parsed.data };
}

export async function reportHistory(client: Client | null, owner: string, kind: ReportKind) {
  if (!client) return [];
  return pages((a, b) => client.from('growth_reports').select('id,period_start,period_end').eq('user_id', owner)
    .eq('kind', kind).order('period_start', { ascending: false }).order('id').range(a, b));
}

export async function reportReminders(client: Client | null, owner: string, today: string) {
  const prefs = { weekly: false, monthly: false };
  const available: { kind: ReportKind; day: string }[] = [];
  if (!client) return { prefs, available };
  const row = await read(client.from('notification_preferences')
    .select('weekly_growth_report_reminder,monthly_growth_report_reminder').eq('user_id', owner).maybeSingle());
  prefs.weekly = row?.weekly_growth_report_reminder === true;
  prefs.monthly = row?.monthly_growth_report_reminder === true;
  const candidates = (['weekly', 'monthly'] as const).filter(kind => prefs[kind]).map(kind => ({
    kind, day: reportPeriod(kind, addDays(reportPeriod(kind, today).start, -1)).start,
  }));
  await Promise.all(candidates.map(async item => {
    const saved = await read(client.from('growth_reports').select('id').eq('user_id', owner)
      .eq('kind', item.kind).eq('period_start', item.day).maybeSingle());
    if (!saved) available.push(item);
  }));
  return { prefs, available: available.sort((a, b) => a.kind.localeCompare(b.kind)) };
}

const section = (metrics: ReportSection['metrics'] = [], lines: ReportSection['lines'] = []): ReportSection => ({ metrics, lines });

export async function generateGrowthReport(client: Client | null, owner: string, kind: ReportKind, period: ReportPeriod,
  through: string, timezone: string, categories: ReportCategory[]): Promise<ReportSnapshot> {
  if (!client) return {};
  const show = (key: ReportCategory) => categories.includes(key);
  const { start, end } = period;
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format;
  const lower = insightDayStart(start, format);
  const upper = insightDayStart(addDays(through, 1), format);
  const next = reportPeriod(kind, addDays(end, 1));

  const [papers, journals, weekly, checkIns, habitData, goalEvents, practices, interactions, relationships, targets, datedEntries] = await Promise.all([
    show('activity') ? pages((a, b) => client.from('growth_exercises').select('module_slug,format:answers->>format').eq('user_id', owner)
      .in('module_slug', ['identity-mapping','values-assessment','thought-record','emotional-wheel','cognitive-reframing','body-awareness-map',
        'future-self-visualization','inner-critic-dialogue','wheel-of-life'])
      .gte('completed_at', lower).lt('completed_at', upper).order('id').range(a, b)) : [],
    show('activity') ? pages((a, b) => client.from('journal_entries').select('id').eq('user_id', owner)
      .gte('created_at', lower).lt('created_at', upper).order('id').range(a, b)) : [],
    show('activity') ? pages((a, b) => client.from('growth_weekly_reflections').select('id').eq('user_id', owner)
      .gte('updated_at', lower).lt('updated_at', upper).order('id').range(a, b)) : [],
    show('emotions') || show('belonging') ? pages((a, b) => client.from('growth_check_ins')
      .select('mood_rating,energy_rating,emotion_labels,mood,belonging:details->scales->belonging').eq('user_id', owner)
      .gte('local_date', start).lte('local_date', through).order('id').range(a, b)) : [],
    show('habits') ? growthHabits(client, owner, start, through) : { habits: [], logs: [] },
    show('goals') ? pages((a, b) => client.from('goal_activity').select('kind').eq('user_id', owner)
      .gte('created_at', lower).lt('created_at', upper).order('id').range(a, b)) : [],
    show('values') ? pages((a, b) => client.from('values_practices').select('kind').eq('user_id', owner)
      .gte('created_at', lower).lt('created_at', upper).order('id').range(a, b)) : [],
    show('social') ? pages((a, b) => client.from('social_interactions').select('local_date,occurred_at,connection:details->>4')
      .eq('user_id', owner).or('and(local_date.gte.' + start + ',local_date.lte.' + through + '),and(local_date.is.null,occurred_at.gte.' +
        lower + ',occurred_at.lt.' + upper + ')').order('id').range(a, b)) : [],
    show('relationships') ? pages((a, b) => client.from('growth_exercises')
      .select('updated_at,reviews:answers->reviews,reflections:answers->reflections,earlier:answers->>1')
      .eq('user_id', owner).eq('module_slug', 'relationship-inventory').order('id').range(a, b)) : [],
    show('intentions') ? pages((a, b) => client.from('goals').select('id,title,target_date,paused:social_goals!social_goals_goal_id_user_id_fkey()')
      .eq('user_id', owner).eq('completed', false).in('paused.status', ['Postponed','Declined']).is('paused', null)
      .gte('target_date', next.start).lte('target_date', next.end).order('target_date').order('id').range(a, b)) : [],
    show('intentions') ? pages((a, b) => client.from('growth_exercises').select('id,module_slug,answers').eq('user_id', owner)
      .or('and(module_slug.eq.life-timeline,answers->>format.eq.timeline-v1,answers->>future.eq.true,answers->>hidden.eq.false,' +
        'answers->timing->>mode.eq.exact,answers->timing->>date.gte.' + next.start + ',answers->timing->>date.lte.' + next.end +
        '),and(module_slug.eq.future-self-visualization,answers->>format.eq.future-v1,answers->>reflectionDate.gte.' +
        next.start + ',answers->>reflectionDate.lte.' + next.end + ')').order('id').range(a, b)) : [],
  ]);

  const snapshot: ReportSnapshot = {};
  const count = (label: string, value: number) => ({ label, value });
  const scored = (label: string, ratings: (number | null)[]) => {
    const score = average(ratings);
    return score.value === null ? [] : [{ label, value: score.value, sample: score.count, unit: '/ 10' }];
  };
  if (show('activity')) snapshot.activity = section([
    count('Completed exercises', papers.length), count('Journal entries created', journals.length),
    count('Weekly reflections saved or updated', weekly.length),
  ]);

  if (show('emotions')) {
    const terms = new Map<string, { text: string; count: number }>();
    for (const entry of checkIns) {
      const labels = entry.emotion_labels?.length ? entry.emotion_labels : entry.mood ? [entry.mood] : [];
      for (const label of labels) {
        const key = label.toLowerCase();
        const previous = terms.get(key);
        terms.set(key, { text: previous?.text ?? label, count: (previous?.count ?? 0) + 1 });
      }
    }
    const frequent = [...terms.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)).slice(0, 8);
    const labeled = checkIns.filter(item => item.emotion_labels?.length || item.mood).length;
    snapshot.emotions = section([count('Check-ins recorded', checkIns.length), count('Check-ins with emotion labels', labeled),
      ...scored('Average overall mood', checkIns.map(item => item.mood_rating)),
      ...scored('Average energy', checkIns.map(item => item.energy_rating))],
    frequent.map(item => ({ text: item.text + ' · ' + item.count + ' of ' + labeled + ' labeled check-ins' })));
  }

  if (show('habits')) {
    const logs = new Map<string, Map<string, typeof habitData.logs[number]>>();
    for (const log of habitData.logs) {
      if (!logs.has(log.habit_id)) logs.set(log.habit_id, new Map());
      logs.get(log.habit_id)!.set(log.local_date, log);
    }
    const days = dateRange(start, through);
    const counts = habitData.habits.map(habit => adherence(habit, days, through, logs.get(habit.id) ?? new Map()));
    const sum = counts.reduce((total, item) => ({ completed: total.completed + item.completed, opportunities: total.opportunities + item.opportunities,
      partial: total.partial + item.partial }), { completed: 0, opportunities: 0, partial: 0 });
    snapshot.habits = section([count('Scheduled opportunities excluding rest days', sum.opportunities), count('Completed', sum.completed),
      count('Partially completed', sum.partial), ...(sum.opportunities ? [{ label: 'Completion share', value: Math.round(sum.completed * 100 / sum.opportunities),
        unit: '%', sample: sum.opportunities }] : [])]);
  }

  if (show('goals')) snapshot.goals = section([
    count('Goals created', goalEvents.filter(row => row.kind === 'goal-created').length),
    count('Goal completions recorded', goalEvents.filter(row => row.kind === 'goal-completed').length),
    count('Milestone completions recorded', goalEvents.filter(row => row.kind === 'milestone-completed').length),
    count('Goals reopened', goalEvents.filter(row => row.kind === 'goal-reopened').length),
  ]);
  if (show('values')) snapshot.values = section([
    count('Values-linked practices created', practices.length),
    ...([['habit','Habit practices'],['goal','Goal practices'],['boundary','Boundary practices'],['social','Social practices']] as const)
      .filter(([value]) => practices.some(row => row.kind === value))
      .map(([value, label]) => count(label, practices.filter(row => row.kind === value).length)),
  ]);
  if (show('social')) snapshot.social = section([count('Interactions recorded', interactions.length),
    count('Dates with an interaction', new Set(interactions.map(row => row.local_date ?? format(new Date(row.occurred_at)))).size),
    count('Interactions with a connection reflection', interactions.filter(row => row.connection?.trim()).length)]);
  if (show('belonging')) snapshot.belonging = section(scored('Average self-reported belonging',
    checkIns.map(item => typeof item.belonging === 'number' ? item.belonging : null)));
  if (show('relationships')) {
    const inPeriod = (day: string) => day >= start && day <= through;
    const reflected = relationships.filter(row => inPeriod(format(new Date(row.updated_at))) &&
      (row.earlier?.trim() || (row.reflections && Object.values(row.reflections).some(value => typeof value === 'string' && value.trim()))));
    const reviews = relationships.flatMap(row => Array.isArray(row.reviews) ? row.reviews : [])
      .filter(item => item !== null && typeof item === 'object' && !Array.isArray(item)
        && typeof item.date === 'string' && inPeriod(item.date));
    snapshot.relationships = section([count('Entries with reflections saved or updated', reflected.length), count('Dated intention reviews', reviews.length)]);
  }
  if (show('intentions')) {
    const dated = [
      ...targets.map(row => ({ text: 'Goal target: ' + row.title, day: row.target_date as string })),
      ...datedEntries.map(row => row.module_slug === 'life-timeline'
        ? { text: 'Timeline milestone: ' + row.answers.title, day: row.answers.timing.date as string }
        : { text: 'Scheduled future-self reflection', day: row.answers.reflectionDate as string }),
    ].sort((a, b) => a.day.localeCompare(b.day) || a.text.localeCompare(b.text));
    snapshot.intentions = section([count('Dated plans in the next period', dated.length)], dated.slice(0, 25));
  }
  return snapshot;
}
