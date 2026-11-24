import { addDays } from '../lib/becoming/habits';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { personalInsights } from '../lib/becoming/insight-data';
import { insightCategories, insightConnections, insightRanges, insightsPath, type InsightKey, type InsightRange } from '../lib/becoming/insights';
import { InsightPreferences } from './insight-preferences';

type Report = Awaited<ReturnType<typeof personalInsights>>;
const labelDay = (day: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })
  .format(new Date(day + 'T00:00:00Z'));

function Card({ kind, href, children }: { kind: InsightKey; href?: string; children: ReactNode }) {
  return <section className="panel growth-panel insights-card" aria-labelledby={'insights-' + kind}>
    <h2 id={'insights-' + kind}>{insightCategories[kind]}</h2>
    {children}
    {href && <Link className="text-button" href={href}>Open {kind === 'goals' ? 'Goals' : kind === 'wheel' ? 'Wheel of Life'
      : kind === 'habits' ? 'Habit Tracker' : kind === 'values' ? 'Values Assessment' : kind === 'social' ? 'Social Integration'
      : kind === 'boundaries' ? 'Boundary Builder' : 'Mood Tracker'}</Link>}
  </section>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

function Bar({ value, maximum }: { value: number; maximum: number }) {
  return <span className="mood-bar" aria-hidden><span style={{ width: Math.min(100, value / maximum * 100) + '%' }} /></span>;
}

function WheelComparison({ wheel }: { wheel: Report['wheel'] }) {
  if (!wheel.length) return <Empty>Save a completed assessment in this period to see domain ratings here.</Empty>;
  const [latest, earlier] = wheel;
  const prior = new Map(earlier?.domains.map(domain => [domain.id, domain.rating]) ?? []);
  const previousOnly = earlier?.domains.filter(domain => !latest.domains.some(item => item.id === domain.id)) ?? [];
  const domains = [...latest.domains, ...previousOnly.map(item => ({ ...item, rating: null }))];
  return <>
    <p>{wheel.length === 1 ? 'One assessment in this period. Complete another to compare.' : 'Comparison of the two most recent assessments in this period.'}</p>
    <div className="mood-chart-table"><table>
      <caption>Personal domain ratings</caption>
      <thead><tr><th scope="col">Domain</th>{earlier && <th scope="col">{labelDay(earlier.day)} · {earlier.domains.filter(x => x.rating !== null).length} rated</th>}
        <th scope="col">{labelDay(latest.day)} · {latest.domains.filter(x => x.rating !== null).length} rated</th></tr></thead>
      <tbody>{domains.map(domain => <tr key={domain.id}><th scope="row">{domain.label}</th>
        {earlier && <td>{prior.get(domain.id) ?? 'No rating'}</td>}<td>{domain.rating ?? 'No rating'}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}

export function GrowthInsights({ report, hidden, range, today, timezone, preview }: {
  report: Report; hidden: InsightKey[]; range: InsightRange; today: string; timezone: string; preview: boolean;
}) {
  const show = (key: InsightKey) => !hidden.includes(key);
  return <div className="growth-module-content">
    <section className="panel growth-panel" aria-labelledby="insight-period">
      <h2 id="insight-period">Date range</h2>
      <nav className="growth-actions" aria-label="Insight date ranges">
        {Object.entries(insightRanges).map(([key, title]) => <Link className="text-button" key={key}
          href={insightsPath + '?range=' + key + (key === 'custom' ? '&start=' + range.start + '&end=' + range.end : '')}
          aria-current={range.key === key ? 'page' : undefined}>{title}</Link>)}
      </nav>
      {range.key === 'custom' && <form action={insightsPath} className="insights-range">
        <input type="hidden" name="range" value="custom" />
        <label>Start date<input name="start" type="date" min="1900-01-01" max={today} defaultValue={range.start} required /></label>
        <label>End date<input name="end" type="date" min="1900-01-01" max={today} defaultValue={range.end} required /></label>
        <button className="secondary">Apply custom range</button>
      </form>}
      {range.invalid ? <p role="alert">Choose an end date on or after the start date and no later than today.</p>
        : <p><strong>{labelDay(range.start)}–{labelDay(range.end)}</strong> · {timezone}</p>}
      {preview && <p className="muted">Sign in to see your own activity. There are no sample records in this view.</p>}
    </section>
    <InsightPreferences hidden={hidden} preview={preview} />
    {!range.invalid && <div className="insights-grid">
      {show('activity') && <Card kind="activity">
        {report.completed.length === 0 && report.savedActivity.length === 0 ? <Empty>No exercises or saved module activity in this period.</Empty> : <>
          {report.completed.length > 0 && <><h3>Completions</h3><ul className="growth-list">
            {report.completed.map(item => <li key={item.slug}><Link href={'/becoming/' + item.slug}>{item.title}</Link> · {item.count} completed</li>)}
          </ul></>}
          {report.savedActivity.length > 0 && <><h3>Saved entries and plans</h3><ul className="growth-list">
            {report.savedActivity.map(item => <li key={item.slug}><Link href={'/becoming/' + item.slug}>{item.title}</Link> · {item.count} saved</li>)}
          </ul></>}
        </>}
      </Card>}
      {show('reflections') && <Card kind="reflections">
        {report.reflections.length ? <ul className="growth-list">{report.reflections.map(item => <li key={item.id}>
          <Link href={item.href}>{item.name}</Link> · <time dateTime={item.day}>{labelDay(item.day)}</time>
        </li>)}</ul> : <Empty>No reflections saved in this period.</Empty>}
      </Card>}
      {show('goals') && <Card kind="goals" href="/goals">
        <p>Goals created or due in the selected period, with their current status.</p>
        {report.goals.length ? <ul className="growth-list">{report.goals.map(item => <li key={item.id}>
          <strong>{item.title}</strong> · {item.status}{item.target && <> · Target {labelDay(item.target)}</>}
        </li>)}</ul> : <Empty>No goals were created or due in this period.</Empty>}
      </Card>}
      {show('values') && <Card kind="values" href="/becoming/values-assessment">
        {report.values?.labels.length ? <><p>Latest assessment as of the end of this range · {labelDay(report.values.day)}</p>
          <ol className="growth-list">{report.values.labels.map((item, index) => <li key={item + index}>{item}</li>)}</ol>
        </> : <Empty>Complete a Values Assessment to see your ranked core values.</Empty>}
      </Card>}
      {show('habits') && <Card kind="habits" href="/becoming/habit-tracker">
        <p>Completed activities per scheduled opportunity. Rest days are excluded and partial activities are listed separately.</p>
        {report.habits.length ? <ul className="growth-list">{report.habits.map(item => <li key={item.id}><strong>{item.title}</strong>
          <div>{item.completed} of {item.opportunities} completed{item.partial > 0 ? ' · ' + item.partial + ' partial' : ''}</div>
          <Bar value={item.completed} maximum={item.opportunities} />
        </li>)}</ul> : <Empty>No habit opportunities in this period.</Empty>}
      </Card>}
      {show('mood') && <Card kind="mood" href="/becoming/mood-tracker">
        {report.mood.some(item => item.count > 0) ? <div className="mood-chart-table"><table>
          <caption>Recorded mood ratings by period</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Mean mood</th><th scope="col">Check-ins rated</th></tr></thead>
          <tbody>{report.mood.map(item => <tr key={item.start}><th scope="row">{labelDay(item.start)}{item.start !== item.end && '–' + labelDay(item.end)}</th>
            <td>{item.value === null ? 'No rating' : <>{item.value} / 10<Bar value={item.value} maximum={10} /></>}</td><td>{item.count}</td>
          </tr>)}</tbody>
        </table></div> : <Empty>No numerical mood ratings in this period.</Empty>}
      </Card>}
      {show('emotions') && <Card kind="emotions" href="/becoming/mood-tracker">
        {report.vocabulary ? <><p>Emotion terms across {report.vocabulary.sample} labeled Mood Tracker check-ins and Emotional Wheel entries. One record can include several terms.</p>
          <ul className="growth-list">{report.vocabulary.terms.map(item => <li key={item.label}>{item.label} · {item.count}</li>)}</ul>
        </> : <Empty>No emotion labels saved in this period.</Empty>}
      </Card>}
      {show('social') && <Card kind="social" href="/becoming/social-integration?section=journal">
        {report.social?.entries ? <dl className="growth-list">
          <div><dt>Interactions recorded</dt><dd>{report.social.entries}</dd></div>
          <div><dt>Dates with an interaction</dt><dd>{report.social.days}</dd></div>
          <div><dt>Interactions with a connection reflection</dt><dd>{report.social.describedConnection}</dd></div>
        </dl> : <Empty>No social interactions were recorded in this period.</Empty>}
      </Card>}
      {show('belonging') && <Card kind="belonging" href="/becoming/mood-tracker">
        {report.belonging?.count ? <><p><strong>{report.belonging.value} / 10</strong> across {report.belonging.count} check-ins with a belonging rating.</p>
          <Bar value={report.belonging.value!} maximum={10} /></> : <Empty>No perceived belonging ratings in this period.</Empty>}
      </Card>}
      {show('boundaries') && <Card kind="boundaries" href="/becoming/boundary-builder">
        {report.boundaries && (report.boundaries.plans || report.boundaries.practice) ? <dl className="growth-list">
          <div><dt>Boundary plans saved or updated</dt><dd>{report.boundaries.plans}</dd></div>
          <div><dt>Practice reflections recorded</dt><dd>{report.boundaries.practice}</dd></div>
        </dl> : <Empty>No boundary plans or practice reflections in this period.</Empty>}
      </Card>}
      {show('wheel') && <Card kind="wheel" href="/becoming/wheel-of-life"><WheelComparison wheel={report.wheel} /></Card>}
      {show('milestones') && <Card kind="milestones">
        <p>Precisely dated plans from today through {labelDay(addDays(today, 90))}, independent of the activity date range.</p>
        {report.milestones.length ? <ul className="growth-list">{report.milestones.map(item => <li key={item.id}>
          <time dateTime={item.day}>{labelDay(item.day)}</time> · <Link href={item.href}>{item.title}</Link> · {item.kind}
        </li>)}</ul> : <Empty>No dated milestones, goal targets, or scheduled reflections in the next 90 days.</Empty>}
      </Card>}
      {show('observations') && <Card kind="observations">
        {report.observations.length ? <ul className="growth-list">{report.observations.map(item => <li key={item}>{item}</li>)}</ul>
          : <Empty>No recorded responses in this period support a descriptive observation yet.</Empty>}
      </Card>}
    </div>}
    <section className="panel growth-panel" aria-labelledby="insight-links">
      <h2 id="insight-links">Connect your work across modules</h2>
      <ul className="growth-list insights-connections">{insightConnections.map(([from, start, to, end, detail]) =>
        <li key={from + to}><Link href={start}>{from}</Link> <span aria-hidden>→</span> <span className="growth-sr">to </span><Link href={end}>{to}</Link>
          <p>{detail}</p>
        </li>)}</ul>
    </section>
  </div>;
}
