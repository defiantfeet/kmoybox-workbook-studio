import { defaultMoodSettings, moodInput, moodSettingsSchema, type MoodRecord } from './mood';
import { addDays } from './habits';
import { type Habit, type HabitLog } from './habits';
import { readTimeline, timelineOrder, type TimelineRecord } from './timeline';
import { readFuture, type FutureSnapshot } from './future';
import { readBody, type BodySnapshot } from './body';
import { socialGoalStatuses, type SocialFields, type SocialGoal, type SocialRecord, type SocialSection } from './social';
import { closenessRings, readRelationship } from './relationships';
import { emptyBoundary, readBoundary, type BoundaryJournal, type BoundaryRecord, type RelationshipOption } from './boundaries';
import { account } from '../data';
import { currentWeek, dateKey } from '../model';
import { demo } from '../session';
import { emptyValues, readValuesAnswers, valueLibrary, type ValuePractice, type ValuesVersion } from './values';
import { readEmotionEntry, type SavedEmotion } from './emotions';
import { emptyDialogue, readDialogue, type DialogueSnapshot, type Statement } from './inner-critic';
import { emptyReframe, readReframe, type ReframeSnapshot, type ThoughtImportOption } from './reframing';
import { emptyThought, readThought, type ThoughtSnapshot } from './thought-record';
import { emptyIdentity, readIdentity, type IdentityVersion } from './identity';
import { emptyDomains, nextWheelReminder, readWheelAnswers, type Assessment } from './wheel';

type Client = Awaited<ReturnType<typeof account>>['client'];

export const defaultGrowthTimezone = 'America/Los_Angeles';
export const growthTimezones = ['UTC', ...Intl.supportedValuesOf('timeZone')];

export function growthDates(timeZone: string) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const now = new Date(date + 'T00:00:00Z');
  return { today: dateKey(now), monday: dateKey(currentWeek(now).start) };
}

export async function growthAccount() {
  if (demo) return { client: null, owner: '', name: '', timezone: defaultGrowthTimezone };
  const { client, user } = await account();
  const { data } = await read(client.from('profiles').select('display_name,growth_timezone').eq('id', user.id).single());
  return { client, owner: user.id, name: data?.display_name?.trim().split(/\s+/)[0] ?? '', timezone: data?.growth_timezone ?? defaultGrowthTimezone };
}

export async function growthTimezone(client: Client, owner: string): Promise<string> {
  const { data } = await read(client.from('profiles').select('growth_timezone').eq('id', owner).single());
  return data?.growth_timezone ?? defaultGrowthTimezone;
}

async function read<T>(query: PromiseLike<{ data: T; error: { code: string } | null }>) {
  const result = await query;
  if (result.error) {
    console.error('Personal Growth read failed', { code: result.error.code });
    throw new Error('Personal Growth could not load. Please try again.');
  }
  return result;
}

export async function growthHabits(client: Client | null, owner: string, since: string, until?: string) {
  const habits: Habit[] = [];
  const logs: HabitLog[] = [];
  if (!client) return { habits, logs };
  const loadHabits = async () => {
    for (let offset = 0; ; offset += 100) {
      const { data } = await read(client.from('growth_habits').select('id,title,started_on,archived_on,updated_at,category,motivation,core_value,notes,ends_on,preferred_time,reminder,completion_type,schedule,schedule_history,paused,goal_id,source')
        .eq('user_id', owner).order('started_on').order('id').range(offset, offset + 99));
      habits.push(...(data ?? []) as Habit[]);
      if (!data || data.length < 100) return;
    }
  };
  const loadLogs = async () => {
    for (let offset = 0; ; offset += 500) {
      let query = client.from('growth_habit_logs').select('habit_id,local_date,state,amount').eq('user_id', owner).gte('local_date', since);
      if (until) query = query.lte('local_date', until);
      const { data } = await read(query.order('local_date').order('habit_id').range(offset, offset + 499));
      logs.push(...(data ?? []) as HabitLog[]);
      if (!data || data.length < 500) return;
    }
  };
  await Promise.all([loadHabits(), loadLogs()]);
  return { habits, logs };
}

export async function habitOptions(client: Client | null, owner: string) {
  if (!client) return { values: [], goals: [] };
  const [assessment, goals] = await Promise.all([
    read(client.from('growth_exercises').select('answers').eq('user_id', owner).eq('module_slug', 'values-assessment')
      .eq('answers->>format', 'values-v1').not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).order('id').limit(1).maybeSingle()),
    read(client.from('goals').select('id,title').eq('user_id', owner).order('created_at', { ascending: false }).order('id').limit(100)),
  ]);
  const values = readValuesAnswers(assessment.data?.answers);
  const labels = new Map([...valueLibrary, ...(values?.custom ?? [])].map(item => [item.id, item.label]));
  return { values: (values?.ranked ?? []).flatMap(id => labels.get(id) ?? []), goals: (goals.data ?? []) as { id: string; title: string }[] };
}

export async function growthMoodHistory(client: Client | null, owner: string, today: string) {
  if (!client) return [];
  const { data } = await read(client.from('growth_check_ins').select('local_date,slot,mood,note,emotion_labels,mood_rating')
    .eq('user_id', owner).eq('local_date', today).not('slot', 'is', null));
  return data ?? [];
}

export async function growthExercise(client: Client | null, owner: string, slug: string) {
  if (!client) return null;
  const { data } = await read(client.from('growth_exercises').select('answers,updated_at,completed_at').eq('user_id', owner)
    .eq('module_slug', slug).eq('is_current', true).maybeSingle());
  return data;
}

function growthHistoryQuery(client: Client, owner: string, slug: string) {
  return client.from('growth_exercises').select('id,answers,completed_at').eq('user_id', owner)
    .eq('module_slug', slug).eq('is_current', false).not('completed_at', 'is', null)
    .order('completed_at', { ascending: false }).order('id');
}

export async function growthExerciseHistory(client: Client | null, owner: string, slug: string) {
  if (!client) return [];
  const { data } = await read(growthHistoryQuery(client, owner, slug).limit(10));
  return data ?? [];
}

export async function growthOverview(client: Client | null, owner: string, timezone: string) {
  const { today, monday } = growthDates(timezone);
  const habitData = growthHabits(client, owner, today, today);
  const moodData = growthMoodHistory(client, owner, today);
  if (!client) return { ...(await habitData), moods: await moodData, exercises: [], draft: null, goals: [], wheelDue: null, boundaryDue: false, futureDue: null, weekly: null, today, monday };

  const [habits, moods, exercises, draft, goals, weekly, reminder, dueBoundary, dueFuture] = await Promise.all([
    habitData, moodData,
    read(client.from('growth_exercises').select('id,module_slug,updated_at,completed_at,answer_format:answers->>format').eq('user_id', owner)
      .or('answers->>format.is.null,and(answers->>format.neq.social-v1,or(answers->>hidden.is.null,answers->>hidden.neq.true))')
      .order('updated_at', { ascending: false }).order('id').limit(100)),
    read(client.from('growth_exercises').select('module_slug').eq('user_id', owner)
      .eq('is_current', true).is('completed_at', null).order('updated_at', { ascending: false }).order('id').limit(1).maybeSingle()),
    read(client.from('goals').select('id,title,target_date,completed,paused:social_goals!social_goals_goal_id_user_id_fkey()')
      .eq('user_id', owner).eq('completed', false).in('paused.status', ['Postponed', 'Declined']).is('paused', null)
      .order('target_date').order('id').limit(5)),
    read(client.from('growth_weekly_reflections').select('answers,updated_at').eq('user_id', owner).eq('week_start', monday).maybeSingle()),
    wheelReminder(client, owner, timezone),
    read(client.from('growth_exercises').select('id').eq('user_id', owner).eq('module_slug', 'boundary-builder')
      .not('completed_at', 'is', null).gte('answers->>followUpDate', '0001-01-01').lte('answers->>followUpDate', today).limit(1)),
    read(client.from('growth_exercises').select('id').eq('user_id', owner).eq('module_slug', 'future-self-visualization')
      .eq('answers->>format', 'future-v1').neq('answers->>reflectionDate', '').lte('answers->>reflectionDate', today)
      .order('answers->>reflectionDate').order('id').limit(1).maybeSingle()),
  ]);
  return { ...habits, moods, exercises: exercises.data ?? [], draft: draft.data, boundaryDue: Boolean(dueBoundary.data?.length), futureDue: dueFuture.data?.id ?? null, wheelDue: reminder.due && reminder.due <= today ? reminder.due : null, goals: goals.data ?? [], weekly: weekly.data, today, monday };
}


export async function wheelReminder(client: Client, owner: string, timezone: string) {
  const { data } = await read(client.from('notification_preferences').select('wheel_reminder_since').eq('user_id', owner).maybeSingle());
  const since = data?.wheel_reminder_since ?? null;
  if (!since) return { since, due: null };
  const latest = await read(client.from('growth_exercises').select('completed_at').eq('user_id', owner)
    .eq('module_slug', 'wheel-of-life').not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(1).maybeSingle());
  return { since, due: nextWheelReminder(since, latest.data?.completed_at, timezone) };
}

export async function wheelAssessments(client: Client, owner: string, all = false): Promise<Assessment[]> {
  const entries: Assessment[] = [];
  const size = 100;
  for (let start = 0; ; start += size) {
    const { data } = await read(client.from('growth_exercises').select('id,answers,completed_at').eq('user_id', owner)
      .eq('module_slug', 'wheel-of-life').not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).order('id').range(start, start + size - 1));
    if (!data) break;
    entries.push(...data.map(entry => ({ id: entry.id, completed_at: entry.completed_at, ...readWheelAnswers(entry.answers) })));
    if (!all || data.length < size) break;
  }
  return entries;
}

export async function wheelModule(client: Client | null, owner: string, timezone: string) {
  if (!client) return { domains: emptyDomains(), assessments: [], id: '', revision: '', reminder: { since: null, due: null }, reflection: undefined };
  const [current, assessments, reminder] = await Promise.all([
    read(client.from('growth_exercises').select('id,answers,updated_at,completed_at').eq('user_id', owner)
      .eq('module_slug', 'wheel-of-life').eq('is_current', true).maybeSingle()),
    wheelAssessments(client, owner),
    wheelReminder(client, owner, timezone),
  ]);
  const saved = current.data ? readWheelAnswers(current.data.answers) : null;
  const draft = saved && !current.data?.completed_at ? saved : null;
  const template = assessments[0]?.domains ?? emptyDomains();
  return {
    domains: draft?.domains ?? template.map(domain => ({ ...domain, rating: null, note: '', priority: false })),
    assessments, id: current.data?.id ?? '', revision: current.data?.updated_at ?? '', reflection: draft?.reflection, reminder,
  };
}


export async function valuesModule(client: Client | null, owner: string) {
  if (!client) return { draft: emptyValues, history: [], legacy: [], practices: [], id: '', revision: '' };
  const base = () => client.from('growth_exercises').select('id,answers,updated_at,completed_at')
    .eq('user_id', owner).eq('module_slug', 'values-assessment');
  const [current, completed, practices] = await Promise.all([
    read(base().eq('is_current', true).maybeSingle()),
    read(base().not('completed_at', 'is', null).order('completed_at', { ascending: false }).order('id').limit(100)),
    read(client.from('values_practices').select('id,assessment_id,value_key,kind,next_step').eq('user_id', owner)
      .order('created_at', { ascending: false }).limit(100)),
  ]);
  const history: ValuesVersion[] = [];
  const legacy: { id: string; completed_at: string; earlier: string[] }[] = [];
  const legacyNotes = (input: Record<string, unknown>) =>
    [input[0], input[1], input[2]].filter((value): value is string => typeof value === 'string' && Boolean(value));
  for (const entry of completed.data ?? []) {
    const answers = readValuesAnswers(entry.answers);
    if (answers) history.push({ id: entry.id, completed_at: entry.completed_at, answers });
    else legacy.push({ id: entry.id, completed_at: entry.completed_at, earlier: legacyNotes(entry.answers) });
  }
  let draft = { ...emptyValues, custom: history[0]?.answers.custom ?? [] };
  if (current.data && !current.data.completed_at) {
    draft = readValuesAnswers(current.data.answers) ?? { ...draft, earlier: legacyNotes(current.data.answers) };
  }
  return { draft, history, legacy, practices: (practices.data ?? []) as ValuePractice[],
    id: current.data?.id ?? '', revision: current.data?.updated_at ?? '' };
}

export async function identityModule(client: Client | null, owner: string) {
  if (!client) return { map: emptyIdentity, versions: [], coreValues: [], id: '', revision: '' };
  const base = () => client.from('growth_exercises').select('id,answers,updated_at,completed_at')
    .eq('user_id', owner).eq('module_slug', 'identity-mapping');
  const [current, completed, values] = await Promise.all([
    read(base().eq('is_current', true).maybeSingle()),
    read(base().not('completed_at', 'is', null).order('completed_at', { ascending: false }).order('id').limit(100)),
    read(client.from('growth_exercises').select('answers').eq('user_id', owner).eq('module_slug', 'values-assessment')
      .contains('answers', { format: 'values-v1' }).not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).limit(1).maybeSingle()),
  ]);
  const versions: IdentityVersion[] = (completed.data ?? []).map(entry => ({
    id: entry.id, savedAt: entry.completed_at, map: readIdentity(entry.answers),
  }));
  const savedValues = readValuesAnswers(values.data?.answers);
  const names = new Map([...valueLibrary, ...(savedValues?.custom ?? [])].map(entry => [entry.id, entry.label]));
  const coreValues = (savedValues?.ranked ?? []).flatMap(id => names.get(id) ?? []);
  return {
    map: current.data && !current.data.completed_at ? readIdentity(current.data.answers) : versions[0]?.map ?? emptyIdentity,
    versions, coreValues, id: current.data?.id ?? '', revision: current.data?.updated_at ?? '',
  };
}


export async function thoughtModule(client: Client | null, owner: string, page: number) {
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  if (!client) return { draft: emptyThought, history: [], id: '', revision: '', page, hasNext: false };
  const base = () => client.from('growth_exercises').select('id,answers,updated_at,completed_at')
    .eq('user_id', owner).eq('module_slug', 'thought-record');
  const [current, completed] = await Promise.all([
    read(base().eq('is_current', true).maybeSingle()),
    read(base().not('completed_at', 'is', null).order('completed_at', { ascending: false }).order('id').range(offset, offset + pageSize)),
  ]);
  const history: ThoughtSnapshot[] = (completed.data ?? []).slice(0, pageSize).map(entry => ({
    id: entry.id, completedAt: entry.completed_at, record: readThought(entry.answers),
  }));
  return {
    draft: current.data && !current.data.completed_at ? readThought(current.data.answers) : emptyThought,
    history, page, hasNext: (completed.data?.length ?? 0) > pageSize, id: current.data?.id ?? '', revision: current.data?.updated_at ?? '',
  };
}


export async function emotionModule(client: Client | null, owner: string) {
  if (!client) return { history: [], draft: null };
  const base = () => client.from('growth_exercises').select('id,answers,updated_at,completed_at').eq('user_id', owner)
    .eq('module_slug', 'emotional-wheel');
  const [completed, earlier] = await Promise.all([
    read(base().not('completed_at', 'is', null).order('completed_at', { ascending: false }).order('id').limit(100)),
    read(base().eq('is_current', true).is('completed_at', null).maybeSingle()),
  ]);
  const history: SavedEmotion[] = (completed.data ?? []).flatMap(row => {
    const entry = readEmotionEntry(row.answers);
    return entry ? [{ id: row.id, completedAt: row.completed_at, entry }] : [];
  });
  const entry = readEmotionEntry(earlier.data?.answers);
  const draft = earlier.data && entry ? { id: earlier.data.id, revision: earlier.data.updated_at, entry } : null;
  return { history, draft };
}


export async function reframingModule(client: Client | null, owner: string) {
  if (!client) return { draft: emptyReframe, history: [], sources: [], id: '', revision: '' };
  const base = () => client.from('growth_exercises').select('id,answers,updated_at,completed_at')
    .eq('user_id', owner).eq('module_slug', 'cognitive-reframing');
  const [current, completed, thoughts] = await Promise.all([
    read(base().eq('is_current', true).maybeSingle()),
    read(base().not('completed_at', 'is', null).order('completed_at', { ascending: false }).order('id').limit(60)),
    read(client.from('growth_exercises').select('id,updated_at,completed_at')
      .eq('user_id', owner).eq('module_slug', 'thought-record').order('updated_at', { ascending: false }).order('id').limit(100)),
  ]);
  const history: ReframeSnapshot[] = (completed.data ?? []).map(entry => ({
    id: entry.id, completedAt: entry.completed_at, entry: readReframe(entry.answers),
  }));
  const sources: ThoughtImportOption[] = (thoughts.data ?? []).map(entry => ({
    id: entry.id, savedAt: entry.completed_at ?? entry.updated_at, draft: !entry.completed_at,
  }));
  return { draft: current.data && !current.data.completed_at ? readReframe(current.data.answers) : emptyReframe,
    history, sources, id: current.data?.id ?? '', revision: current.data?.updated_at ?? '' };
}


export async function innerCriticModule(client: Client | null, owner: string) {
  if (!client) return { draft: emptyDialogue, history: [], statements: [], values: [], identities: [], id: '', revision: '' };
  const base = () => client.from('growth_exercises').select('id,answers,updated_at,completed_at')
    .eq('user_id', owner).eq('module_slug', 'inner-critic-dialogue');
  const completed = (slug: string) => client.from('growth_exercises').select('answers').eq('user_id', owner).eq('module_slug', slug)
    .not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(1).maybeSingle();
  const [current, archived, collection, valuesData, mapData] = await Promise.all([
    read(base().eq('is_current', true).maybeSingle()),
    read(base().not('completed_at', 'is', null).order('completed_at', { ascending: false }).order('id').limit(60)),
    read(client.from('supportive_statements').select('id,body,created_at').eq('user_id', owner).order('created_at', { ascending: false }).order('id')),
    read(completed('values-assessment')),
    read(completed('identity-mapping')),
  ]);
  const history: DialogueSnapshot[] = (archived.data ?? []).map(entry => ({
    id: entry.id, completedAt: entry.completed_at, entry: readDialogue(entry.answers),
  }));
  const values = readValuesAnswers(valuesData.data?.answers);
  const labels = new Map([...valueLibrary, ...(values?.custom ?? [])].map(entry => [entry.id, entry.label]));
  const identities = readIdentity(mapData.data?.answers).nodes.map(node => node.label);
  return { draft: current.data && !current.data.completed_at ? readDialogue(current.data.answers) : emptyDialogue,
    history, statements: (collection.data ?? []) as Statement[],
    values: (values?.ranked ?? []).flatMap(id => labels.get(id) ?? []), identities: [...new Set(identities)],
    id: current.data?.id ?? '', revision: current.data?.updated_at ?? '' };
}


export async function boundaryModule(client: Client | null, owner: string, selected: string) {
  const empty = { id: '', revision: '', savedAt: null, entry: emptyBoundary };
  if (!client) return { record: empty, boundaries: [], relationships: [], values: [], journal: [] };
  const base = () => client.from('growth_exercises').select('id,answers,updated_at,completed_at')
    .eq('user_id', owner).eq('module_slug', 'boundary-builder');
  const [active, archive, relationshipsData, valuesData, journalData] = await Promise.all([
    read(selected ? base().eq('id', selected).not('completed_at', 'is', null).maybeSingle()
      : base().eq('is_current', true).is('completed_at', null).maybeSingle()),
    read(base().not('completed_at', 'is', null).order('updated_at', { ascending: false }).order('id').limit(100)),
    read(client.from('growth_exercises').select('id,updated_at,completed_at,label:answers->>label').eq('user_id', owner)
      .eq('module_slug', 'relationship-inventory').order('updated_at', { ascending: false }).limit(100)),
    read(client.from('growth_exercises').select('answers').eq('user_id', owner).eq('module_slug', 'values-assessment')
      .contains('answers', { format: 'values-v1' }).not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).limit(1).maybeSingle()),
    selected ? read(client.from('boundary_practice_entries').select('id,occurred_on,practice,reflection')
      .eq('user_id', owner).eq('boundary_id', selected).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(100)) : null,
  ]);
  const activeRow = active.data;
  const record: BoundaryRecord = activeRow ? {
    id: activeRow.id, revision: activeRow.updated_at, savedAt: activeRow.completed_at, entry: readBoundary(activeRow.answers),
  } : empty;
  const boundaries = (archive.data ?? []).map(row => {
    const item = readBoundary(row.answers);
    return { id: row.id as string, label: item.notes.situation?.slice(0, 100) || item.category || 'Untitled boundary',
      category: item.category, zone: item.zone, followUpDate: item.followUpDate };
  });
  const relationships: RelationshipOption[] = (relationshipsData.data ?? []).map(row => ({
    id: row.id, savedAt: row.completed_at ?? row.updated_at, draft: !row.completed_at, label: row.label ?? '',
  }));
  const values = readValuesAnswers(valuesData.data?.answers);
  const names = new Map([...valueLibrary, ...(values?.custom ?? [])].map(item => [item.id, item.label]));
  return { record, boundaries, relationships, values: (values?.ranked ?? []).flatMap(id => names.get(id) ?? []),
    journal: (journalData?.data ?? []) as BoundaryJournal[] };
}

export async function relationshipModule(client: Client | null, owner: string, selected: string) {
  const entries: { id: string; label: string; ring: typeof closenessRings[number] | '' }[] = [];
  if (!client) return { entries, record: null, legacy: [] };
  const table = client.from('growth_exercises');
  const filter = <Columns extends string>(columns: Columns) => table.select(columns).eq('user_id', owner).eq('module_slug', 'relationship-inventory');
  const [record, legacy] = await Promise.all([
    selected ? read(filter('id,answers,updated_at').eq('id', selected).maybeSingle()) : null,
    read(filter('id,answers,updated_at').is('answers->>format', null).order('updated_at', { ascending: false }).limit(100)),
  ]);
  for (let start = 0; ; start += 100) {
    const { data } = await read(filter('id,label:answers->>label,ring:answers->>ring')
      .eq('answers->>format', 'relationship-v1').order('id').range(start, start + 99));
    if (!data) break;
    entries.push(...data.map((row): typeof entries[number] => ({ id: row.id, label: row.label,
      ring: closenessRings.find(ring => ring === row.ring) ?? '' })));
    if (data.length < 100) break;
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));
  const saved = readRelationship(record?.data?.answers);
  return { entries, record: saved && record?.data ? { id: record.data.id as string, revision: record.data.updated_at as string, entry: saved } : null,
    legacy: (legacy.data ?? []).map(row => ({ id: row.id as string, date: row.updated_at as string,
      notes: ['0', '1', '2'].map(key => typeof row.answers?.[key] === 'string' ? row.answers[key] as string : ''),
      emotions: Array.isArray(row.answers?.emotions) ? row.answers.emotions.filter((item: unknown) => typeof item === 'string') as string[] : [] })) };
}

export async function socialModule(client: Client | null, owner: string, section: SocialSection, page: number, monday: string) {
  const records: SocialRecord[] = [];
  const goals: SocialGoal[] = [];
  const interactions: (SocialRecord & { day: string; legacy: string })[] = [];
  if (!client) return { records, goals, interactions, progress: null, legacy: null, earlier: [], hasMore: false };
  const start = (page - 1) * 20;
  const exercises = () => client.from('growth_exercises').select('id,answers,updated_at').eq('user_id', owner)
    .eq('module_slug', 'social-integration').eq('answers->>format', 'social-v1');
  const record = (row: { id: string; updated_at: string; answers: { key: string; fields: SocialFields } }): SocialRecord =>
    ({ id: row.id, updatedAt: row.updated_at, key: row.answers.key, fields: row.answers.fields });
  const [progress, legacy, earlier, selected, currentWeek, goalRows, journal] = await Promise.all([
    read(exercises().eq('answers->>kind', 'progress').maybeSingle()),
    section === 'awareness' ? growthExercise(client, owner, 'social-integration') : null,
    section === 'awareness' ? read(client.from('growth_exercises').select('id,answers,completed_at').eq('user_id', owner)
      .eq('module_slug', 'social-integration').is('answers->>format', null).eq('is_current', false).not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).order('id').range(start, start + 20)) : null,
    !['goals', 'journal'].includes(section) ? read((section === 'weekly'
      ? exercises().eq('answers->>kind', section).neq('answers->>key', monday).order('answers->>key', { ascending: false })
      : exercises().eq('answers->>kind', section).order('updated_at', { ascending: false }))
      .order('id').range(section === 'awareness' ? 0 : start, section === 'awareness' ? 0 : start + 20)) : null,
    section === 'weekly' ? read(exercises().eq('answers->>kind', 'weekly').eq('answers->>key', monday).maybeSingle()) : null,
    section === 'goals' ? read(client.from('social_goals').select('id,updated_at,status,notes,goal:goals!social_goals_goal_id_user_id_fkey(title,target_date,completed)')
      .eq('user_id', owner).order('updated_at', { ascending: false }).order('id').range(start, start + 20)) : null,
    section === 'journal' ? read(client.from('social_interactions').select('id,updated_at,occurred_at,local_date,details,reflection')
      .eq('user_id', owner).order('local_date', { ascending: false, nullsFirst: false }).order('occurred_at', { ascending: false })
      .order('id').range(start, start + 20)) : null,
  ]);
  if (currentWeek?.data) records.push(record(currentWeek.data));
  records.push(...(selected?.data ?? []).slice(0, 20).map(record));
  for (const row of (goalRows?.data ?? []).slice(0, 20)) {
    const relation = Array.isArray(row.goal) ? row.goal[0] : row.goal;
    if (!relation) continue;
    const status = relation.completed ? 'Completed' : socialGoalStatuses.find(value => value === row.status && value !== 'Completed') ?? 'Active';
    goals.push({ id: row.id, updatedAt: row.updated_at, title: relation.title, target: relation.target_date ?? '', status, notes: row.notes });
  }
  for (const row of (journal?.data ?? []).slice(0, 20)) {
    interactions.push({ id: row.id, updatedAt: row.updated_at, key: '', fields: row.details,
      day: row.local_date ?? row.occurred_at.slice(0, 10), legacy: row.reflection });
  }
  return { records, goals, interactions, progress: progress.data ? record(progress.data) : null, legacy,
    earlier: (earlier?.data ?? []).slice(0, 20),
    hasMore: [selected, goalRows, journal, earlier].some(result => (result?.data?.length ?? 0) > 20) };
}

export async function bodyModule(client: Client | null, owner: string, page: number, selected: string) {
  const history: BodySnapshot[] = [];
  if (!client) return { history, selected: null, legacy: null, earlier: [], hasNext: false };
  const pageSize = 12;
  const from = (page - 1) * pageSize;
  const base = () => client.from('growth_exercises').select('id,answers,completed_at')
    .eq('user_id', owner).eq('module_slug', 'body-awareness-map').not('completed_at', 'is', null);
  const structured = () => base().eq('answers->>format', 'body-v1');
  const [saved, current, legacy, earlier] = await Promise.all([
    read(structured().order('completed_at', { ascending: false }).order('id').range(from, from + pageSize)),
    selected ? read(structured().eq('id', selected).maybeSingle()) : null,
    growthExercise(client, owner, 'body-awareness-map'),
    read(base().is('answers->>format', null).eq('is_current', false)
      .order('completed_at', { ascending: false }).order('id').range(from, from + pageSize)),
  ]);
  const snapshot = (row: { id: string; completed_at: string; answers: unknown }): BodySnapshot[] => {
    const entry = readBody(row.answers);
    return entry ? [{ id: row.id, completedAt: row.completed_at, entry }] : [];
  };
  history.push(...(saved.data ?? []).slice(0, pageSize).flatMap(snapshot));
  return { history, selected: current?.data ? snapshot(current.data)[0] ?? null : null, legacy,
    earlier: (earlier.data ?? []).slice(0, pageSize),
    hasNext: (saved.data?.length ?? 0) > pageSize || (earlier.data?.length ?? 0) > pageSize };
}

export async function futureModule(client: Client | null, owner: string, page: number, selected: string) {
  const history: FutureSnapshot[] = [];
  if (!client) return { history, selected: null, values: [], legacy: null, earlier: [], hasNext: false };
  const size = 15;
  const start = (page - 1) * size;
  const base = () => client.from('growth_exercises').select('id,updated_at,completed_at,answers')
    .eq('user_id', owner).eq('module_slug', 'future-self-visualization').not('completed_at', 'is', null);
  const [archive, current, valuesData, legacy, earlier] = await Promise.all([
    read(base().eq('answers->>format', 'future-v1').order('completed_at', { ascending: false }).order('id').range(start, start + size)),
    selected ? read(base().eq('answers->>format', 'future-v1').eq('id', selected).maybeSingle()) : null,
    read(client.from('growth_exercises').select('answers').eq('user_id', owner).eq('module_slug', 'values-assessment')
      .eq('answers->>format', 'values-v1').not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).order('id').limit(1).maybeSingle()),
    growthExercise(client, owner, 'future-self-visualization'),
    read(base().is('answers->>format', null).eq('is_current', false)
      .order('completed_at', { ascending: false }).order('id').range(start, start + size)),
  ]);
  const snapshot = (row: { id: string; updated_at: string; completed_at: string; answers: unknown }): FutureSnapshot[] => {
    const entry = readFuture(row.answers);
    return entry ? [{ id: row.id, revision: row.updated_at, completedAt: row.completed_at, entry }] : [];
  };
  history.push(...(archive.data ?? []).slice(0, size).flatMap(snapshot));
  const values = readValuesAnswers(valuesData.data?.answers);
  const labels = new Map([...valueLibrary, ...(values?.custom ?? [])].map(item => [item.id, item.label]));
  return { history, selected: current?.data ? snapshot(current.data)[0] ?? null : null,
    legacy, earlier: (earlier.data ?? []).slice(0, size), values: (values?.ranked ?? []).flatMap(id => labels.get(id) ?? []),
    hasNext: (archive.data?.length ?? 0) > size || (earlier.data?.length ?? 0) > size };
}

export async function timelineModule(client: Client | null, owner: string) {
  const records: TimelineRecord[] = [];
  if (!client) return { records, legacy: null, earlier: [], identity: [], future: [] };
  const base = () => client.from('growth_exercises').select('id,created_at,updated_at,answers,timeline_images(event_id)')
    .eq('user_id', owner).eq('module_slug', 'life-timeline').eq('answers->>format', 'timeline-v1');
  const loadRecords = async () => {
    for (let start = 0; ; start += 100) {
      const { data } = await read(base().order('created_at').order('id').range(start, start + 99));
      const rows = data ?? [];
      for (const row of rows) {
        const event = readTimeline(row.answers);
        if (event) records.push({ id: row.id, revision: row.updated_at, createdAt: row.created_at, event,
          image: Array.isArray(row.timeline_images) ? row.timeline_images.length > 0 : Boolean(row.timeline_images) });
      }
      if (rows.length < 100) break;
    }
    records.sort(timelineOrder);
  };
  const [, legacy, earlier, identity, future] = await Promise.all([
    loadRecords(),
    growthExercise(client, owner, 'life-timeline'),
    read(growthHistoryQuery(client, owner, 'life-timeline').is('answers->>format', null).limit(10)),
    read(client.from('growth_exercises').select('answers').eq('user_id', owner).eq('module_slug', 'identity-mapping')
      .eq('answers->>format', 'identity-v1').order('updated_at', { ascending: false }).order('id').limit(1).maybeSingle()),
    read(client.from('growth_exercises').select('id,answers').eq('user_id', owner).eq('module_slug', 'future-self-visualization')
      .eq('answers->>format', 'future-v1').order('completed_at', { ascending: false }).order('id').limit(8)),
  ]);
  return { records, legacy, earlier: earlier.data ?? [],
    identity: [...new Set(readIdentity(identity.data?.answers).nodes.map(node => node.label))],
    future: (future.data ?? []).flatMap(row => {
      const entry = readFuture(row.answers);
      return entry ? [{ id: row.id as string, target: entry.target, horizon: entry.horizon }] : [];
    }) };
}

export async function advancedMoodModule(client: Client | null, owner: string, day: string, id: string, timezone: string) {
  const entries: MoodRecord[] = [];
  const habits: string[] = [];
  const social: string[] = [];
  if (!client) return { entries, selected: null, habits, social, settings: defaultMoodSettings };
  const since = addDays(day, -29);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const base = () => client.from('growth_check_ins').select('id,updated_at,occurred_at,local_date,timezone,slot,mood,mood_rating,energy_rating,note,emotion_labels,details,context_tags')
    .eq('user_id', owner);
  const map = (row: {
    id: string; updated_at: string; occurred_at: string | null; local_date: string; timezone: string; slot: MoodRecord['slot'];
    mood: string | null; mood_rating: number | null; energy_rating: number | null; note: string;
    emotion_labels: string[]; details: { scales: unknown; notes: unknown }; context_tags: unknown;
  }): MoodRecord[] => {
    const result = moodInput.safeParse({ rating: row.mood_rating, energy: row.energy_rating, emotions: row.emotion_labels, note: row.note,
      scales: row.details.scales, details: row.details.notes, tags: row.context_tags });
    return result.success ? [{ ...result.data, id: row.id, revision: row.updated_at, occurredAt: row.occurred_at,
      day: row.local_date, timezone: row.timezone, slot: row.slot, legacy: row.mood }] : [];
  };
  const loadEntries = async () => {
    for (let offset = 0; ; offset += 200) {
      const { data } = await read(base().gte('local_date', since).lte('local_date', day)
        .order('local_date', { ascending: false }).order('occurred_at', { ascending: false, nullsFirst: false })
        .order('id').range(offset, offset + 199));
      const rows = data ?? [];
      entries.push(...rows.flatMap(map));
      if (rows.length < 200) break;
    }
  };
  const loadCooccurrences = async () => {
    for (let offset = 0; ; offset += 500) {
      const { data } = await read(client.from('growth_habit_logs').select('local_date').eq('user_id', owner)
        .eq('state', 'Completed').gte('local_date', since).lte('local_date', day).order('local_date').order('id').range(offset, offset + 499));
      habits.push(...(data ?? []).map(row => row.local_date));
      if ((data?.length ?? 0) < 500) break;
    }
  };
  const loadSocial = async () => {
    for (let offset = 0; ; offset += 500) {
      const { data } = await read(client.from('social_interactions').select('local_date,occurred_at').eq('user_id', owner)
        .or('and(local_date.gte.' + since + ',local_date.lte.' + day + '),and(local_date.is.null,occurred_at.gte.' +
          addDays(since, -1) + 'T00:00:00Z,occurred_at.lt.' + addDays(day, 2) + 'T00:00:00Z)')
        .order('id').range(offset, offset + 499));
      social.push(...(data ?? []).map(row => row.local_date ?? date.format(new Date(row.occurred_at))));
      if ((data?.length ?? 0) < 500) break;
    }
  };
  const [, , , selected, stored] = await Promise.all([
    loadEntries(), loadCooccurrences(), loadSocial(),
    id ? read(base().eq('id', id).maybeSingle()) : null,
    read(client.from('notification_preferences').select('mood_preferences').eq('user_id', owner).maybeSingle()),
  ]);
  const preferences = moodSettingsSchema.safeParse(stored.data?.mood_preferences);
  return { entries, selected: selected?.data ? map(selected.data)[0] ?? null : null,
    habits: [...new Set(habits)], social: [...new Set(social)], settings: preferences.success ? preferences.data : defaultMoodSettings };
}
