'use client';

import { useGrowthContent } from './growth-content-context';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Circle } from 'lucide-react';
import { setHabit } from '../lib/becoming/actions';
import { manageHabit, saveHabit, saveHabitLog } from '../lib/becoming/habit-actions';
import { addDays, adherence, completionTypes, dailySchedule, dateRange, habitCategories, habitPath, habitStates, habitTemplates,
  isScheduled, scheduleModes, scheduleNames, weekdays, type Habit, type HabitFields, type HabitLog } from '../lib/becoming/habits';
import { StudioForm } from './forms';

type View = 'week' | 'month' | 'calendar';
type Props = {
  habits: Habit[]; logs: HabitLog[]; values: string[]; goals: { id: string; title: string }[];
  source: HabitFields['source']; today: string; day: string; range: { start: string; end: string };
  view: View; timezone: string; centralized?: boolean; localTime: string; preview: boolean;
};
type Options = Pick<Props, 'values' | 'goals' | 'today' | 'source' | 'preview' | 'centralized'>;
const label = (day: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'long' }) =>
  new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z'));

function HabitEditor({ habit, values, goals, today, source, preview, centralized }: Options & { habit?: Habit }) {
  const managed = useGrowthContent('habit');
  const defaults: HabitFields = {
    title: '', category: source === 'social' ? 'Social connection' : '', motivation: '', core_value: '', notes: '',
    started_on: today, ends_on: null, preferred_time: null, reminder: false, completion_type: 'Check-off', schedule: dailySchedule,
    goal_id: null, source,
  };
  const [entry, setEntry] = useState<HabitFields>(habit ?? defaults);
  const patch = (fields: Partial<HabitFields>) => setEntry(previous => ({ ...previous, ...fields }));
  const action = saveHabit.bind(null, habit?.id ?? '', habit?.updated_at ?? '');
  return <StudioForm action={async (previous, form) => {
    const result = await action(previous, form);
    if (!habit && !result.error) setEntry(defaults);
    return result;
  }} className="stack growth-form habit-editor">
    <input type="hidden" name="habit" value={JSON.stringify(entry)} />
    {!habit && <label>Optional template<select value="" onChange={event => {
      const template = habitTemplates.find(([title]) => title === event.target.value);
      const resource = managed.find(item => item.item_id === event.target.value);
      if (template) patch({ title: entry.title || template[0], category: entry.category || template[1] });
      if (resource) patch({ title: entry.title || resource.title.slice(0, 80), notes: entry.notes || resource.body.slice(0, 2000) });
    }}><option value="">Choose a starting point</option>{habitTemplates.map(([title]) => <option key={title}>{title}</option>)}{managed.map(item => <option key={item.item_id} value={item.item_id}>{item.title}</option>)}</select></label>}
    <div className="future-grid">
      <label>{habit ? 'Habit name' : 'New habit'}<input required maxLength={80} value={entry.title} onChange={event => patch({ title: event.target.value })} /></label>
      <label>Category (optional)<select value={entry.category} onChange={event => patch({ category: event.target.value as HabitFields['category'] })}>
        <option value="">No category</option>{habitCategories.map(category => <option key={category}>{category}</option>)}
      </select></label>
      <label>Personal motivation (optional)<textarea maxLength={2000} rows={2} value={entry.motivation}
        onChange={event => patch({ motivation: event.target.value })} /></label>
      <div>
        <label>Associated core value (optional)<input maxLength={100} value={entry.core_value} onChange={event => patch({ core_value: event.target.value })} /></label>
        {values.length > 0 && <label>Choose a saved core value<select value="" onChange={event => patch({ core_value: event.target.value })}>
          <option value="">Choose a value</option>{values.map(value => <option key={value}>{value}</option>)}
        </select></label>}
      </div>
      <label>Frequency<select value={entry.schedule.mode} onChange={event => {
        const mode = event.target.value as HabitFields['schedule']['mode'];
        patch({ schedule: { ...dailySchedule, mode, days: mode === 'weekly' || mode === 'selected' ? [1] : [], every: mode === 'custom' ? 2 : 1 } });
      }}>{scheduleModes.map(mode => <option key={mode} value={mode}>{scheduleNames[mode]}</option>)}</select></label>
      {entry.schedule.mode === 'weekly' && <label>Weekly day<select value={entry.schedule.days[0]} onChange={event =>
        patch({ schedule: { ...entry.schedule, days: [Number(event.target.value)] } })}>
        {weekdays.map((weekday, index) => <option key={weekday} value={index + 1}>{weekday}</option>)}
      </select></label>}
      {entry.schedule.mode === 'custom' && <label>Repeat every (days)<input type="number" required min={1} max={365}
        value={Number.isNaN(entry.schedule.every) ? '' : entry.schedule.every} onChange={event =>
          patch({ schedule: { ...entry.schedule, every: event.target.valueAsNumber } })} /></label>}
      <label>Completion type<select value={entry.completion_type} onChange={event => patch({ completion_type: event.target.value as HabitFields['completion_type'] })}>
        {completionTypes.map(type => <option key={type}>{type}</option>)}
      </select></label>
      <label>Start date<input type="date" required value={entry.started_on} min="1900-01-01" onChange={event => patch({ started_on: event.target.value })} /></label>
      <label>End date (optional)<input type="date" value={entry.ends_on ?? ''} min={entry.started_on}
        onChange={event => patch({ ends_on: event.target.value || null })} /></label>
      <label>Preferred time (optional)<input type="time" value={entry.preferred_time ?? ''}
        onChange={event => patch({ preferred_time: event.target.value || null, reminder: Boolean(event.target.value) && entry.reminder })} /></label>
      <label>Personal goal (optional)<select value={entry.goal_id ?? ''} onChange={event => patch({ goal_id: event.target.value || null })}>
        <option value="">No linked goal</option>
        {entry.goal_id && !goals.some(goal => goal.id === entry.goal_id) && <option value={entry.goal_id}>Current linked goal</option>}
        {goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
      </select></label>
    </div>
    {entry.schedule.mode === 'selected' && <fieldset className="habit-checks"><legend>Choose scheduled days</legend>
      {weekdays.map((weekday, index) => <label key={weekday}><input type="checkbox" checked={entry.schedule.days.includes(index + 1)}
        onChange={event => patch({ schedule: { ...entry.schedule, days: event.target.checked
          ? [...entry.schedule.days, index + 1] : entry.schedule.days.filter(day => day !== index + 1) } })} /> {weekday}</label>)}
    </fieldset>}
    {!centralized && <label className="habit-check"><input type="checkbox" checked={entry.reminder} disabled={!entry.preferred_time}
      onChange={event => patch({ reminder: event.target.checked })} /> Show an in-app reminder at my preferred time</label>}
    <label>Notes (optional)<textarea maxLength={2000} rows={2} value={entry.notes} onChange={event => patch({ notes: event.target.value })} /></label>
    {habit && <p className="muted">Schedule edits take effect today. Earlier scheduled days remain in your history.</p>}
    <button className="primary" disabled={preview}>{habit ? 'Save habit' : 'Add habit'}</button>
  </StudioForm>;
}

function Controls({ habit, preview }: { habit: Habit; preview: boolean }) {
  const [confirmed, confirm] = useState(false);
  return <StudioForm action={manageHabit.bind(null, habit.id, habit.updated_at)} className="stack growth-form">
    {!habit.archived_on && <div className="growth-actions">
      <button className="secondary" name="intent" value={habit.paused ? 'resume' : 'pause'} disabled={preview}>
        {habit.paused ? 'Resume habit' : 'Pause habit'}
      </button>
      <button className="secondary" name="intent" value="archive" disabled={preview}>Archive habit</button>
    </div>}
    <details><summary>Delete this habit</summary>
      <p>Deleting a habit removes its history.</p>
      <label className="habit-check"><input name="confirm" type="checkbox" value="yes" checked={confirmed}
        onChange={event => confirm(event.target.checked)} /> Confirm habit and history deletion</label>
      <button className="secondary" name="intent" value="delete" disabled={preview || !confirmed}>Delete habit permanently</button>
    </details>
  </StudioForm>;
}

function LogEditor({ habit, day, log, preview }: { habit: Habit; day: string; log?: HabitLog; preview: boolean }) {
  const [state, setState] = useState<typeof habitStates[number]>(log?.state ?? 'Not recorded');
  const [amount, setAmount] = useState(log?.amount?.toString() ?? '');
  return <StudioForm action={saveHabitLog.bind(null, habit.id, day)} className="stack growth-form">
    <label>{habit.title} activity<select name="state" value={state} onChange={event => setState(event.target.value as typeof state)}>
      {habitStates.map(value => <option key={value}>{value}</option>)}
    </select></label>
    {habit.completion_type !== 'Check-off' && ['Completed', 'Partially completed'].includes(state) && <label>
      {habit.completion_type === 'Minutes' ? 'Minutes (optional)' : 'Count (optional)'}
      <input name="amount" type="number" min={0} max={100000} step="any" value={amount} onChange={event => setAmount(event.target.value)} /></label>}
    <button className="secondary" disabled={preview}>Save activity</button>
  </StudioForm>;
}

export function HabitTracker({ habits, logs, values, goals, source, today, day, range, view, timezone, localTime, preview, centralized = false }: Props) {
  const [selected, selectDate] = useState(day);
  const byHabit = new Map<string, Map<string, HabitLog>>();
  for (const log of logs) {
    const dates = byHabit.get(log.habit_id) ?? new Map<string, HabitLog>();
    dates.set(log.local_date, log);
    byHabit.set(log.habit_id, dates);
  }
  const dates = dateRange(range.start, range.end);
  const relevant = habits.filter(habit => dates.some(date => isScheduled(habit, date) || byHabit.get(habit.id)?.has(date)));
  const dayHabits = habits.filter(habit => isScheduled(habit, selected) || byHabit.get(habit.id)?.has(selected));
  const reminders = habits.filter(habit => !habit.archived_on && habit.reminder && habit.preferred_time && habit.preferred_time <= localTime
    && isScheduled(habit, today) && !byHabit.get(habit.id)?.has(today));
  const link = (mode: View, date: string) => habitPath + '?view=' + mode + '&day=' + date + (source ? '&source=' + source : '');
  const next = addDays(range.end, 1);
  const options = { values, goals, today, source, preview, centralized };
  return <>
    <section className="panel growth-panel" aria-labelledby="habit-review">
      <h2 id="habit-review">{view === 'week' ? 'Week of ' + label(range.start) : label(range.start, { month: 'long', year: 'numeric' })}</h2>
      <p className="muted">Dates and reminder times use {timezone}. {centralized && <Link href="/becoming/notifications">Manage delivery in Notification settings.</Link>}</p>
      <nav className="growth-actions" aria-label="Habit Tracker views">
        {([['week','Weekly'],['month','Monthly'],['calendar','Calendar']] as const).map(([mode, title]) =>
          <Link key={mode} className="text-button" href={link(mode, day)} aria-current={view === mode ? 'page' : undefined}>{title}</Link>)}
      </nav>
      <nav className="growth-actions" aria-label="Habit history periods">
        {range.start > '1900-01-01' && <Link href={link(view, addDays(range.start, -1))}>Earlier period</Link>}
        {next <= today && <Link href={link(view, next)}>Later period</Link>}
        {day !== today && <Link href={link(view, today)}>Current period</Link>}
      </nav>
      {!centralized && reminders.length > 0 && day === today && <div className="habit-reminders">
        <h3>Scheduled reminders</h3><ul className="growth-list">{reminders.map(habit => <li key={habit.id}>{habit.title} · {habit.preferred_time}</li>)}</ul>
      </div>}
      {!relevant.length && <p className="muted">There are no scheduled or recorded habits for this period.</p>}
      {view === 'week' && <ul className="growth-list">
        {relevant.map(habit => <li className="growth-habit" key={habit.id}>
          <h3>{habit.title}</h3><div className="growth-week">
            {dates.map(date => {
              const state = byHabit.get(habit.id)?.get(date)?.state ?? 'Not recorded';
              const checked = state === 'Completed';
              const scheduled = isScheduled(habit, date);
              return <form key={date} action={setHabit.bind(null, habit.id, date, !checked)}>
                <button className="growth-day" aria-label={habit.title + ', ' + label(date, { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + (scheduled || state !== 'Not recorded' ? state : 'Not scheduled')}
                  aria-pressed={checked} disabled={preview || date > today || (!scheduled && state === 'Not recorded')
                    || habit.completion_type !== 'Check-off' || (!checked && state !== 'Not recorded')}>
                  <span>{label(date, { weekday: 'short' })}</span>
                  {checked ? <Check size={16} aria-hidden /> : <Circle size={13} aria-hidden />}
                </button>
                <small>{scheduled || state !== 'Not recorded' ? state : 'Not scheduled'}</small>
              </form>;
            })}
          </div>
        </li>)}
      </ul>}
      {view === 'calendar' && <div className="habit-calendar" role="group" aria-label="Calendar days">
        {weekdays.map(name => <span aria-hidden key={name}>{name.slice(0, 3)}</span>)}
        {dates.map((date, index) => {
          const count = habits.filter(habit => byHabit.get(habit.id)?.get(date)?.state === 'Completed').length;
          const start = (new Date(range.start + 'T00:00:00Z').getUTCDay() + 6) % 7;
          return <button className="secondary" type="button" key={date} style={index === 0 ? { gridColumnStart: start + 1 } : undefined}
            aria-label={label(date) + ', ' + count + ' completed'} aria-pressed={selected === date} disabled={date > today}
            onClick={() => selectDate(date)}>{Number(date.slice(-2))}<small>{count || '–'}</small></button>;
        })}
      </div>}
      {view !== 'calendar' && relevant.length > 0 && <div className="habit-summary">
        <h3>Consistency in this period</h3>
        <p>Completed days are compared with scheduled opportunities through today. Rest days are excluded, and partial days appear separately. A schedule change keeps activities you already recorded.</p>
        <ul className="growth-list">{relevant.map(habit => {
          const history = byHabit.get(habit.id) ?? new Map();
          const summary = adherence(habit, dates, today, history);
          return <li key={habit.id}><strong>{habit.title}</strong>
            <p>{summary.percent === null ? 'No scheduled opportunities' : summary.completed + ' of ' + summary.opportunities + ' completed · ' + summary.percent + '%'}
              {summary.partial > 0 ? ' · ' + summary.partial + ' partial' : ''}</p>
            <details><summary>Previous four weeks</summary>
              <ul className="growth-list">{[4, 3, 2, 1].map(index => {
                const end = addDays(range.start, -(index - 1) * 7 - 1);
                const start = addDays(end, -6);
                const trend = adherence(habit, dateRange(start, end), today, history);
                return <li key={index}>{label(start, { month: 'short', day: 'numeric' })}–{label(end, { month: 'short', day: 'numeric' })} ·
                  {trend.percent === null ? ' No scheduled opportunities' : ' ' + trend.completed + ' of ' + trend.opportunities + ' completed'}
                </li>;
              })}</ul>
            </details>
          </li>;
        })}</ul>
      </div>}
    </section>
    <section className="panel growth-panel" aria-labelledby="habit-log">
      <h2 id="habit-log">Record or review a day</h2>
      <label className="values-label">Activity date<select value={selected} onChange={event => selectDate(event.target.value)}>
        {dates.filter(date => date <= today).map(date => <option value={date} key={date}>{label(date)}</option>)}
      </select></label>
      {!dayHabits.length && <p className="muted">There are no scheduled activities or logs for this day.</p>}
      {dayHabits.map(habit => {
        const log = byHabit.get(habit.id)?.get(selected);
        return <LogEditor key={habit.id + selected + log?.state + log?.amount} habit={habit} day={selected} log={log} preview={preview} />;
      })}
    </section>
    <section className="panel growth-panel" aria-labelledby="habit-manage">
      <h2 id="habit-manage">Manage habits</h2>
      <HabitEditor {...options} />
      {habits.map(habit => <details className="habit-manage" key={habit.id}>
        <summary>{habit.title}{habit.archived_on ? ' · Archived' : habit.paused ? ' · Paused' : ''}</summary>
        {habit.source && <p>From <Link href={habit.source === 'future' ? '/becoming/future-self-visualization' : '/becoming/social-integration'}>
          {habit.source === 'future' ? 'Future-Self Visualization' : 'Social Integration'}
        </Link></p>}
        <HabitEditor key={habit.updated_at} habit={habit} {...options} />
        <Controls habit={habit} preview={preview} />
      </details>)}
      <div className="growth-actions">
        <Link href="/goals">Open Goals</Link><Link href="/becoming/future-self-visualization">Open Future-Self Visualization</Link>
        <Link href="/becoming/social-integration">Open Social Integration</Link>
      </div>
    </section>
  </>;
}
