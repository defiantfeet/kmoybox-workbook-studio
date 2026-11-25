import 'server-only';

import type { account } from '../data';
import { findModule } from './catalog';
import { growthHabits } from './data';
import { addDays, adherence, dateRange } from './habits';
import { insightDayStart, insightKeys, type InsightKey, type InsightRange } from './insights';
import { average } from './mood';
import { readValuesAnswers, valueLibrary } from './values';
import { readWheelAnswers } from './wheel';

type Client = Awaited<ReturnType<typeof account>>['client'];

async function rows<T>(load: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const result: T[] = [];
  for (let start = 0; ; start += 250) {
    const response = await load(start, start + 249);
    if (response.error) throw new Error('Your private insights could not be loaded.');
    result.push(...(response.data ?? []));
    if (!response.data || response.data.length < 250) return result;
  }
}

export async function insightPreferences(client: Client | null, owner: string): Promise<InsightKey[]> {
  if (!client) return ['observations'];
  const { data, error } = await client.from('notification_preferences').select('hidden_growth_insights').eq('user_id', owner).maybeSingle();
  if (error) throw new Error('Your insight preferences could not be loaded.');
  return Array.isArray(data?.hidden_growth_insights) ? insightKeys.filter(key => data.hidden_growth_insights.includes(key)) : ['observations'];
}

export async function personalInsights(client: Client | null, owner: string, timezone: string, today: string, range: InsightRange, hidden: InsightKey[]) {
  const visible = (key: InsightKey) => !hidden.includes(key);
  const empty = { completed: [], savedActivity: [], reflections: [], goals: [], values: null, habits: [], mood: [],
    vocabulary: null, social: null, belonging: null, boundaries: null, wheel: [], milestones: [], observations: [] };
  if (!client || range.invalid) return empty;
  const { start, end } = range;
  const formatDay = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const lower = insightDayStart(start, formatDay.format);
  const upper = insightDayStart(addDays(end, 1), formatDay.format);
  const local = (value: string) => formatDay.format(new Date(value));
  const within = (day: string) => day >= start && day <= end;
  const moduleTitle = (slug: string) => findModule(slug)?.title ?? slug;
  const next = addDays(today, 90);
  const exerciseBase = () => client.from('growth_exercises').select('id,module_slug,completed_at,updated_at,format:answers->>format,hidden:answers->>hidden,kind:answers->>kind')
    .eq('user_id', owner);
  const needsExercises = visible('activity') || visible('reflections') || visible('boundaries');
  const needsMood = ['mood', 'emotions', 'belonging', 'observations'].some(key => visible(key as InsightKey));
  const needsSocial = visible('social') || visible('observations');
  const [
    exercises, weekly, journal, habitData, mood, social, practice, valuesRows, wheelRows, goals, goalMilestones, upcomingExercises, wheelEmotions,
  ] = await Promise.all([
    needsExercises ? rows((from, to) => exerciseBase().or('and(completed_at.gte.' + lower + ',completed_at.lt.' + upper +
      '),and(updated_at.gte.' + lower + ',updated_at.lt.' + upper + ')').order('id').range(from, to)) : [],
    visible('reflections') ? rows((from, to) => client.from('growth_weekly_reflections').select('id,updated_at').eq('user_id', owner)
      .gte('updated_at', lower).lt('updated_at', upper).order('id').range(from, to)) : [],
    visible('reflections') ? rows((from, to) => client.from('journal_entries').select('id,updated_at').eq('user_id', owner)
      .gte('updated_at', lower).lt('updated_at', upper).order('id').range(from, to)) : [],
    visible('habits') ? growthHabits(client, owner, start, end) : { habits: [], logs: [] },
    needsMood ? rows((from, to) => client.from('growth_check_ins')
      .select('id,local_date,mood_rating,mood,emotion_labels,context_tags,belonging:details->scales->belonging,authenticity:details->scales->authenticity')
      .eq('user_id', owner).gte('local_date', start).lte('local_date', end).order('id').range(from, to)) : [],
    needsSocial ? rows((from, to) => client.from('social_interactions')
      .select('id,local_date,occurred_at,connection:details->>4,authenticity:details->>5').eq('user_id', owner)
      .or('and(local_date.gte.' + start + ',local_date.lte.' + end + '),and(local_date.is.null,occurred_at.gte.' +
        lower + ',occurred_at.lt.' + upper + ')').order('id').range(from, to)) : [],
    visible('boundaries') || visible('reflections') || visible('observations') ? rows((from, to) =>
      client.from('boundary_practice_entries').select('id,occurred_on').eq('user_id', owner)
        .gte('occurred_on', start).lte('occurred_on', end).order('id').range(from, to)) : [],
    visible('values') ? rows((from, to) => client.from('growth_exercises').select('id,completed_at,answers').eq('user_id', owner)
      .eq('module_slug', 'values-assessment').eq('answers->>format', 'values-v1').not('completed_at', 'is', null)
      .lt('completed_at', upper).order('completed_at', { ascending: false }).order('id').range(from,to).limit(1)) : [],
    visible('wheel') ? rows((from, to) => client.from('growth_exercises').select('id,completed_at,answers').eq('user_id', owner)
      .eq('module_slug', 'wheel-of-life').gte('completed_at', lower).lt('completed_at', upper)
      .order('completed_at', { ascending: false }).order('id').range(from, to)) : [],
    visible('goals') || visible('milestones') ? rows((from, to) => client.from('goals')
      .select('id,title,completed,created_at,target_date,social_goals!social_goals_goal_id_user_id_fkey(status)').eq('user_id', owner)
      .or('and(created_at.gte.' + lower + ',created_at.lt.' + upper + '),and(target_date.gte.' +
        (start < today ? start : today) + ',target_date.lte.' + (end > next ? end : next) + ')')
      .order('id').range(from, to)) : [],
    visible('milestones') ? rows((from, to) => client.from('goal_milestones').select('id,goal_id,title').eq('user_id', owner)
      .eq('completed', false).order('id').range(from, to)) : [],
    visible('milestones') ? rows((from, to) => client.from('growth_exercises')
      .select('id,module_slug,answers').eq('user_id', owner).or('and(module_slug.eq.life-timeline,answers->>format.eq.timeline-v1,' +
        'answers->>future.eq.true,answers->>hidden.eq.false,answers->timing->>mode.eq.exact,answers->timing->>date.gte.' + today +
        ',answers->timing->>date.lte.' + next + '),and(module_slug.eq.future-self-visualization,answers->>format.eq.future-v1,' +
        'answers->>reflectionDate.gte.' + today + ',answers->>reflectionDate.lte.' + next + ')').order('id').range(from, to)) : [],
    visible('emotions') ? rows((from, to) => client.from('growth_exercises').select('emotions:answers->emotions')
      .eq('user_id', owner).eq('module_slug', 'emotional-wheel').eq('answers->>format', 'emotion-v1')
      .gte('completed_at', lower).lt('completed_at', upper).order('id').range(from, to)) : [],
  ]);

  const savedFormats = new Set(['boundary-v1', 'relationship-v1', 'timeline-v1', 'social-v1']);
  const completedEntries = exercises.filter(row => row.hidden !== 'true' && row.completed_at && within(local(row.completed_at)) && !savedFormats.has(row.format ?? ''));
  const countModules = (items: typeof exercises) => {
    const counts = new Map<string, number>();
    for (const row of items) counts.set(row.module_slug, (counts.get(row.module_slug) ?? 0) + 1);
    return [...counts].map(([slug, count]) => ({ slug, title: moduleTitle(slug), count }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  };
  const savedEntries = exercises.filter(row => row.hidden !== 'true' && savedFormats.has(row.format ?? '') && within(local(row.updated_at)));
  const basicReflections = completedEntries.filter(row => ['thought-record','cognitive-reframing','emotional-wheel','body-awareness-map',
    'future-self-visualization','inner-critic-dialogue','identity-mapping','values-assessment','wheel-of-life'].includes(row.module_slug));
  const reflections = [
    ...basicReflections.map(row => ({ id: row.id, name: moduleTitle(row.module_slug), day: local(row.completed_at!), href: '/becoming/' + row.module_slug })),
    ...weekly.filter(row => within(local(row.updated_at))).map(row => ({ id: row.id, name: 'Weekly reflection', day: local(row.updated_at), href: '/becoming#growth-weekly' })),
    ...journal.filter(row => within(local(row.updated_at))).map(row => ({ id: row.id, name: 'Journal entry', day: local(row.updated_at), href: '/journal' })),
    ...savedEntries.filter(row => row.module_slug === 'social-integration' && ['awareness','expectations','weekly','practice'].includes(row.kind ?? ''))
      .map(row => ({ id: row.id, name: 'Social Integration reflection', day: local(row.updated_at), href: '/becoming/social-integration' })),
    ...practice.map(row => ({ id: row.id, name: 'Boundary practice reflection', day: row.occurred_on, href: '/becoming/boundary-builder' })),
  ].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 8);
  const habitLogs = new Map<string, Map<string, typeof habitData.logs[number]>>();
  for (const log of habitData.logs) {
    if (!habitLogs.has(log.habit_id)) habitLogs.set(log.habit_id, new Map());
    habitLogs.get(log.habit_id)!.set(log.local_date, log);
  }
  const days = visible('habits') ? dateRange(start, end) : [];
  const habits = habitData.habits.map(habit => ({ id: habit.id, title: habit.title,
    ...adherence(habit, days, today, habitLogs.get(habit.id) ?? new Map()) })).filter(habit => habit.opportunities > 0);

  const dailyRatings = new Map<string, number[]>();
  const emotionCounts = new Map<string, { label: string; count: number }>();
  let labeledEntries = 0;
  for (const entry of mood) {
    if (entry.mood_rating !== null) {
      const current = dailyRatings.get(entry.local_date) ?? [];
      current.push(entry.mood_rating);
      dailyRatings.set(entry.local_date, current);
    }
  }
  const labelSets: unknown[] = [
    ...mood.map(entry => entry.emotion_labels?.length ? entry.emotion_labels : entry.mood ? [entry.mood] : []),
    ...wheelEmotions.map(entry => entry.emotions),
  ];
  for (const labels of labelSets) {
    if (!Array.isArray(labels)) continue;
    const emotions = [...new Set(labels.filter((term): term is string => typeof term === 'string' && Boolean(term.trim())))];
    if (emotions.length) labeledEntries++;
    for (const emotion of emotions) {
      const key = emotion.toLowerCase();
      const previous = emotionCounts.get(key);
      emotionCounts.set(key, { label: previous?.label ?? emotion, count: (previous?.count ?? 0) + 1 });
    }
  }
  const dates = visible('mood') ? dateRange(start, end) : [];
  const bucketSize = dates.length > 366 ? Math.ceil(dates.length / 60) : dates.length > 31 ? 7 : 1;
  const moodTrend = [];
  for (let index = 0; index < dates.length; index += bucketSize) {
    const group = dates.slice(index, index + bucketSize);
    moodTrend.push({ start: group[0], end: group.at(-1)!, ...average(group.flatMap(day => dailyRatings.get(day) ?? [])) });
  }
  const socialInRange = social.filter(entry => within(entry.local_date ?? local(entry.occurred_at)));
  const socialDays = new Set(socialInRange.map(entry => entry.local_date ?? local(entry.occurred_at)));
  const belonging = average(mood.flatMap(entry => typeof entry.belonging === 'number' ? [entry.belonging] : []));
  const latestValues = valuesRows.find(row => row.completed_at && local(row.completed_at) <= end && readValuesAnswers(row.answers));
  const parsedValues = readValuesAnswers(latestValues?.answers);
  const valueNames = new Map([...valueLibrary, ...(parsedValues?.custom ?? [])].map(value => [value.id, value.label]));
  const wheel = wheelRows.filter(row => row.completed_at && within(local(row.completed_at))).slice(0, 2).map(row => ({
    day: local(row.completed_at), domains: readWheelAnswers(row.answers).domains.map(({ id, label, rating }) => ({ id, label, rating })),
  }));
  const status = (goal: typeof goals[number]) => {
    const link = Array.isArray(goal.social_goals) ? goal.social_goals[0] : goal.social_goals;
    return goal.completed ? 'Completed' : link?.status === 'Postponed' || link?.status === 'Declined' ? link.status : 'Open';
  };
  const selectedGoals = goals.filter(goal => within(local(goal.created_at)) || (goal.target_date && within(goal.target_date)))
    .map(goal => ({ id: goal.id, title: goal.title, target: goal.target_date, status: status(goal) }));
  const datedGoals = goals.filter(goal => goal.target_date && goal.target_date >= today && goal.target_date <= next && status(goal) === 'Open');
  const goalDates = new Map(datedGoals.map(goal => [goal.id, goal.target_date as string]));
  const milestones = [
    ...datedGoals.map(goal => ({ id: goal.id, day: goal.target_date as string, title: goal.title, kind: 'Goal target', href: '/goals' })),
    ...goalMilestones.flatMap(milestone => {
      const day = goalDates.get(milestone.goal_id);
      return day ? [{ id: milestone.id, day, title: milestone.title, kind: 'Milestone · linked goal target', href: '/goals' }] : [];
    }),
    ...upcomingExercises.map(item => item.module_slug === 'life-timeline'
      ? { id: item.id, day: item.answers.timing.date as string, title: item.answers.title as string, kind: 'Life Timeline milestone', href: '/becoming/life-timeline?event=' + item.id }
      : { id: item.id, day: item.answers.reflectionDate as string, title: 'Future-self reflection', kind: 'Scheduled reflection', href: '/becoming/future-self-visualization?entry=' + item.id }),
  ].sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
  const creative = new Set(mood.filter(entry => Array.isArray(entry.context_tags) &&
    entry.context_tags.some((tag: unknown) => typeof tag === 'string' && tag.toLowerCase() === 'creativity')).map(entry => entry.local_date));
  const authenticity = mood.filter(entry => typeof entry.authenticity === 'number').length
    + socialInRange.filter(entry => entry.authenticity?.trim()).length;
  const observations = [
    creative.size ? 'Dates with a check-in tagged Creativity: ' + creative.size + '.' : '',
    authenticity ? 'Check-ins or interactions with an authenticity response: ' + authenticity + '.' : '',
    practice.length ? 'Boundary practice reflections recorded: ' + practice.length + '.' : '',
  ].filter(Boolean);

  return { completed: countModules(completedEntries), savedActivity: countModules(savedEntries), reflections, goals: selectedGoals,
    values: parsedValues && latestValues ? { day: local(latestValues.completed_at), labels: parsedValues.ranked.flatMap(id => valueNames.get(id) ?? []) } : null,
    habits, mood: moodTrend, vocabulary: labeledEntries ? { sample: labeledEntries,
      terms: [...emotionCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) } : null,
    social: { entries: socialInRange.length, days: socialDays.size, describedConnection: socialInRange.filter(entry => entry.connection?.trim()).length },
    belonging, boundaries: { plans: savedEntries.filter(row => row.module_slug === 'boundary-builder').length, practice: practice.length },
    wheel, milestones, observations };
}
