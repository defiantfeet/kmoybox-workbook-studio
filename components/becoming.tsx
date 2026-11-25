import { moduleAvailable, type PublishedContent } from '../lib/becoming/content-catalog';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpen, Heart, Sprout, Sunrise, Sun, CloudSun, Moon } from 'lucide-react';
import { categories, checkIns, findModule, moods, reflection } from '../lib/becoming/catalog';
import { saveCheckIn, saveGrowthTimezone, saveWeekly } from '../lib/becoming/actions';
import { growthTimezones, type growthMoodHistory, type growthOverview } from '../lib/becoming/data';
import { isScheduled } from '../lib/becoming/habits';
import { StudioForm } from './forms';
import { GrowthFields, MoodFields } from './growth-fields';

type Overview = Awaited<ReturnType<typeof growthOverview>>;
type Moods = Awaited<ReturnType<typeof growthMoodHistory>>;
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(date.length === 10 ? date + 'T00:00:00Z' : date));
const slotIcons = [Heart, Sunrise, Sun, CloudSun, Moon];

export function GrowthPreview() {
  return <p className="panel growth-preview">You’re viewing a preview. Sign in to save and revisit your activity.</p>;
}

export function CheckIns({ entries, today, preview, dailyOnly = false }: { entries: Moods; today: string; preview: boolean; dailyOnly?: boolean }) {
  return <div className="growth-checkins">
    {checkIns.filter(item => !dailyOnly || item.key === 'daily').map(({ key, title, prompt }, index) => {
      const entry = entries.find(item => item.local_date === today && item.slot === key);
      const Icon = slotIcons[index];
      return <section className="panel growth-panel growth-checkin" key={key} aria-labelledby={'growth-' + key}>
        <div className="growth-card-icon"><Icon size={19} aria-hidden /></div>
        <h3 id={'growth-' + key}>{title}</h3>
        <p>{prompt}</p>
        <p className="growth-status">{entry ? 'Today: ' + (entry.emotion_labels?.length ? entry.emotion_labels.join(', ') : entry.mood_rating !== null ? entry.mood_rating + ' / 10' : entry.mood) : 'No check-in yet today.'}</p>
        <details>
          <summary>{entry ? 'Edit check-in' : 'Check in'}<span className="growth-sr"> for {title}</span></summary>
          <MoodFields action={saveCheckIn.bind(null, key, today)} moods={moods} mood={entry?.mood ?? undefined} note={entry?.note} initialEmotions={entry?.emotion_labels} disabled={preview} />
        </details>
      </section>;
    })}
  </div>;
}

export function Becoming({ name, overview, timezone, preview, onboarding, centralized = false, published = [] }: { name: string; overview: Overview; timezone: string; preview: boolean; onboarding?: ReactNode; centralized?: boolean; published?: PublishedContent[] }) {
  const { habits, logs, moods: entries, exercises, draft, goals, weekly, today, monday } = overview;
  const recent = exercises.filter(item => item.completed_at && item.module_slug !== 'boundary-builder' && !['relationship-v1', 'timeline-v1'].includes(item.answer_format ?? '')).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')).slice(0, 4);
  const todayLogs = new Map(logs.filter(log => log.local_date === today).map(log => [log.habit_id, log.state]));
  const active = habits.filter(habit => !habit.archived_on && isScheduled(habit, today) && todayLogs.get(habit.id) !== 'Rest day');
  const completedToday = new Set(logs.filter(log => log.local_date === today && log.state === 'Completed').map(log => log.habit_id));
  return <>
    <header className="growth-hero">
      <p className="growth-greeting"><Sprout size={19} aria-hidden /> {name ? 'Welcome, ' + name : 'Welcome to your growth space'}</p>
      <h1>The Becoming Studio</h1>
      <p>Understand yourself. Connect with others. Grow on your own terms.</p>
      <Link className="primary" href="#growth-modules"><BookOpen size={17} aria-hidden /> Explore modules</Link>
      <Link className="text-button" href="/becoming/insights">Open Personal Growth Insights</Link>
      <Link className="text-button" href="/becoming/reports">Open Growth Reports</Link>
      <Link className="text-button" href="/becoming/notifications">Notification settings</Link>
    </header>
    {preview && <GrowthPreview />}
    {onboarding}
    <p className="growth-section">The Studio is not monitored for emergencies. <Link className="text-button" href="/support">Get support</Link></p>
    {!centralized && overview.boundaryDue && <section className="panel growth-panel growth-section" aria-labelledby="boundary-due">
      <h2 id="boundary-due">Boundary follow-up reminder</h2>
      <p>A private check-in you scheduled is due.</p>
      <Link className="text-button" href="/becoming/boundary-builder#boundary-library">Review boundary follow-ups</Link>
    </section>}
    {!centralized && overview.futureDue && <section className="panel growth-panel growth-section" aria-labelledby="future-due">
      <h2 id="future-due">Future-self reflection reminder</h2>
      <p>A reflection you scheduled is ready to revisit.</p>
      <Link className="text-button" href={'/becoming/future-self-visualization?entry=' + overview.futureDue + '#future-editor'}>Revisit your future-self entry</Link>
    </section>}
    {!centralized && overview.wheelDue && <section className="panel growth-panel growth-section" aria-labelledby="wheel-due">
      <h2 id="wheel-due">Wheel of Life reminder</h2>
      <p>Your monthly reassessment is due. Revisit it when the timing feels right.</p>
      <Link className="text-button" href="/becoming/wheel-of-life">Revisit your Wheel of Life</Link>
    </section>}
    <section aria-labelledby="growth-checkin-title" className="growth-section">
      <h2 id="growth-checkin-title">Check in with yourself</h2>
      <CheckIns entries={entries} today={today} preview={preview} />
    </section>
    <div className="growth-overview">
      <section className="panel growth-panel" aria-labelledby="growth-continue">
        <h2 id="growth-continue">Continue previous activity</h2>
        {draft ? <Link className="text-button" href={'/becoming/' + draft.module_slug}>Resume {findModule(draft.module_slug)?.title}</Link>
          : <p className="muted">Your saved drafts will appear here. <Link href="#growth-modules">Choose an exercise</Link> to get started.</p>}
      </section>
      <section className="panel growth-panel" aria-labelledby="growth-recent">
        <h2 id="growth-recent">Recently completed exercises</h2>
        {recent.length ? <ul className="growth-list">{recent.map(item => <li key={item.id}>
          <Link href={'/becoming/' + item.module_slug}>{findModule(item.module_slug)?.title}</Link>
        </li>)}</ul> : <p className="muted">Exercises you mark complete will show up here.</p>}
      </section>
      <section className="panel growth-panel" aria-labelledby="growth-goals">
        <h2 id="growth-goals">Personal growth goals</h2>
        {goals.length ? <ul className="growth-list">{goals.map(goal => <li key={goal.id}>{goal.title}{goal.target_date && <> · <time dateTime={goal.target_date}>{dateLabel(goal.target_date)}</time></>}</li>)}</ul>
          : <p className="muted">Add a goal when there’s something you want to work toward.</p>}
        <Link className="text-button" href="/goals">Open Goals</Link>
      </section>
      <section className="panel growth-panel" aria-labelledby="growth-habits">
        <h2 id="growth-habits">Habit overview</h2>
        {active.length ? <><p>{active.filter(habit => completedToday.has(habit.id)).length} of {active.length} complete today</p>
          <ul className="growth-list">{active.slice(0, 5).map(habit => <li key={habit.id}>{habit.title} · {todayLogs.get(habit.id) ?? 'Not recorded'}</li>)}</ul></>
          : <p className="muted">{habits.length ? 'No habits are scheduled for today.' : 'Start with one small habit you can return to each day.'}</p>}
        <Link className="text-button" href="/becoming/habit-tracker">Open Habit Tracker</Link>
      </section>
      <section className="panel growth-panel" aria-labelledby="growth-weekly">
        <h2 id="growth-weekly">Weekly reflection</h2>
        <p className="muted">Week of {dateLabel(monday)}{weekly ? ' · Saved' : ''}</p>
        <GrowthFields key={monday} action={saveWeekly.bind(null, monday)} fields={reflection.fields} answers={weekly?.answers}
          revision={weekly?.updated_at} disabled={preview} />
      </section>
      <section className="panel growth-panel growth-social" aria-labelledby="growth-social">
        <h2 id="growth-social">Social connection prompt</h2>
        <p>If connection feels right this week, what is one small step that fits your energy and circumstances?</p>
        <Link className="text-button" href="/becoming/social-integration">Open Social Integration</Link>
      </section>
    </div>
    <section id="growth-modules" className="growth-section" aria-labelledby="growth-module-title">
      <h2 id="growth-module-title">Explore growth modules</h2>
      <div className="growth-categories">
        {categories.filter(category => category.modules.some(module => moduleAvailable(published, module.slug))).map(category => <article className="panel growth-panel growth-category" key={category.title}>
          <h3>{category.title}</h3>
          <ul className="growth-list">{category.modules.filter(module => moduleAvailable(published, module.slug)).map(module => <li key={module.slug}>
            <Link href={'/becoming/' + module.slug}>{module.title}</Link>
          </li>)}</ul>
        </article>)}
      </div>
    </section>
    <section className="panel growth-panel growth-section" aria-labelledby="growth-history">
      <h2 id="growth-history">Progress history</h2>
      {exercises.length ? <ul className="growth-list">{exercises.map(item => <li key={item.id}>
        <Link href={'/becoming/' + item.module_slug + (item.completed_at && item.module_slug === 'boundary-builder' ? '?boundaryId=' + item.id : item.answer_format === 'relationship-v1' ? '?relationshipId=' + item.id : item.answer_format === 'body-v1' ? '?observation=' + item.id + '#body-history' : item.answer_format === 'future-v1' ? '?entry=' + item.id + '#future-editor' : item.answer_format === 'timeline-v1' ? '?event=' + item.id + '#timeline-editor' : '')}>{findModule(item.module_slug)?.title}</Link>
        {' · ' + (item.completed_at ? item.module_slug === 'boundary-builder' ? 'Boundary saved' : item.answer_format === 'relationship-v1' ? 'Relationship saved' : item.answer_format === 'timeline-v1' ? 'Event saved' : item.answer_format === 'body-v1' ? 'Observation saved' : 'Completed' : 'Draft saved') + ' · '}
        <time dateTime={item.updated_at}>{dateLabel(item.updated_at, { month: 'short', day: 'numeric', timeZone: timezone })}</time>
      </li>)}</ul> : <p className="muted">Save an exercise to begin your progress history.</p>}
      <Link className="text-button" href="/becoming/mood-tracker">View mood history</Link>
    </section>
    {!preview && <section className="panel growth-panel growth-section" aria-labelledby="growth-timezone">
      <h2 id="growth-timezone">Calendar settings</h2>
      <StudioForm action={saveGrowthTimezone} className="stack growth-form">
        <label htmlFor="growth-timezone-choice">Timezone</label>
        <select id="growth-timezone-choice" name="timezone" defaultValue={timezone} key={timezone}>
          {[...new Set([timezone, ...growthTimezones])].sort().map(option => <option key={option}>{option}</option>)}
        </select>
        <button className="primary">Save timezone</button>
      </StudioForm>
    </section>}
  </>;
}
