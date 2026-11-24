'use client';

import Link from 'next/link';
import { memo, useActionState, useState, type CSSProperties } from 'react';
import type { ActionState } from '../lib/actions';
import { saveWheel, saveWheelGoal, saveWheelReminder } from '../lib/becoming/wheel-actions';
import { emptyDomains, localWheelDate, maxDomains, wheelTrends, type Assessment, type Domain } from '../lib/becoming/wheel';
import { studioPath } from '../lib/studio-path';
import { StudioForm } from './forms';

type Props = {
  domains: Domain[]; assessments: Assessment[]; id: string; revision: string; reflection?: string;
  reminder: { since: string | null; due: string | null }; timezone: string; preview: boolean; centralized?: boolean;
};

function coordinates(index: number, count: number, radius: number) {
  const angle = 2 * Math.PI * index / count - Math.PI / 2;
  return [50 + radius * Math.cos(angle), 50 + radius * Math.sin(angle)];
}

function Radar({ domains, highlighted }: { domains: Domain[]; highlighted: string }) {
  const polygon = domains.map((domain, index) => coordinates(index, domains.length, (domain.rating ?? 0) * 3.9)
    .map(value => value.toFixed(2) + '%').join(' ')).join(',');
  return <div className="wheel-radar" role="group" aria-label="Radar chart axes">
    <div className="wheel-rings" aria-hidden />
    <div className="wheel-shape" style={{ clipPath: domains.length >= 3 ? 'polygon(' + polygon + ')' : 'none' }}
      data-filled={domains.length >= 3 && domains.some(domain => domain.rating !== null)} aria-hidden />
    {domains.map((domain, index) => {
      const [x, y] = coordinates(index, domains.length, 46);
      const [dx, dy] = coordinates(index, domains.length, (domain.rating ?? 0) * 3.9);
      const style = { left: x + '%', top: y + '%', '--wheel-angle': 360 * index / domains.length + 'deg' } as CSSProperties;
      return <div key={domain.id}>
        <i className="wheel-spoke" style={style} aria-hidden />
        {domain.rating !== null && <i className="wheel-point" style={{ left: dx + '%', top: dy + '%' }} aria-hidden />}
        <button type="button" className="wheel-axis" data-active={highlighted === domain.id} style={style}
          aria-label={(index + 1) + '. Edit rating for ' + (domain.label || 'new domain')} onClick={() => document.getElementById('rating-' + domain.id)?.focus()}>{index + 1}</button>
      </div>;
    })}
  </div>;
}

const Comparison = memo(function Comparison({ assessments, timezone }: Pick<Props, 'assessments' | 'timezone'>) {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [period, setPeriod] = useState<'month' | 'quarter'>('month');
  if (!assessments.length) return <p className="muted">Complete an assessment to see your history and trends.</p>;
  const first = assessments.find(entry => entry.id === left) ?? assessments[0];
  const second = assessments.find(entry => entry.id === right) ?? assessments[1];
  const dateFormat = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium' });
  const labels = assessments.map(entry => dateFormat.format(new Date(entry.completed_at)));
  const byKey = new Map(second?.domains.map(domain => [domain.id + '/' + domain.label.toLowerCase(), domain]));
  const makeKey = (domain: Domain) => domain.id + '/' + domain.label.toLowerCase();
  const rows = [...first.domains, ...(second?.domains ?? []).filter(domain => !first.domains.some(item => makeKey(item) === makeKey(domain)))];
  const recentTrends = wheelTrends(assessments, timezone, period);
  return <>
    <div className="wheel-options">
      <label>Assessment<select value={first.id} onChange={event => setLeft(event.target.value)}>
        {assessments.map((entry, index) => <option key={entry.id} value={entry.id}>{labels[index]}</option>)}
      </select></label>
      {second && <label>Compare with<select value={second.id} onChange={event => setRight(event.target.value)}>
        {assessments.map((entry, index) => <option key={entry.id} value={entry.id}>{labels[index]}</option>)}
      </select></label>}
    </div>
    {second && <p className="muted">Differences are shown when the same domain and label appear in both assessments.</p>}
    <table className="wheel-table">
      <caption>Saved domain ratings</caption>
      <thead><tr><th scope="col">Domain</th><th scope="col">Assessment</th>{second && <><th scope="col">Comparison</th><th scope="col">Difference</th></>}</tr></thead>
      <tbody>{rows.map(domain => {
        const key = makeKey(domain);
        const a = first.domains.find(item => makeKey(item) === key)?.rating ?? null;
        const b = byKey.get(key)?.rating ?? null;
        const change = a !== null && b !== null ? a - b : null;
        return <tr key={key}><th scope="row">{domain.label}</th><td>{a ?? '—'}</td>{second && <>
          <td>{b ?? '—'}</td><td>{change === null ? '—' : change > 0 ? '+' + change : change}</td>
        </>}</tr>;
      })}</tbody>
    </table>
    {[first, second].filter((entry): entry is Assessment => Boolean(entry)).filter((entry, index) => index === 0 || entry.id !== first.id).map(entry => (
      <details key={entry.id}>
        <summary>Reflections and priorities for {dateFormat.format(new Date(entry.completed_at))}</summary>
        {entry.reflection && <p className="growth-note">{entry.reflection}</p>}
        <ul>{entry.domains.filter(domain => domain.note || domain.priority).map(domain => <li key={domain.id}>
          <strong>{domain.label}{domain.priority ? ' · Priority' : ''}</strong>{domain.note && <p className="growth-note">{domain.note}</p>}
        </li>)}</ul>
        {!entry.reflection && !entry.domains.some(domain => domain.note || domain.priority) && <p>No reflections or priorities saved.</p>}
      </details>
    ))}
    <h3>Rating trends</h3>
    <label>Trend period<select value={period} onChange={event => setPeriod(event.target.value === 'quarter' ? 'quarter' : 'month')}>
      <option value="month">Monthly</option><option value="quarter">Quarterly</option>
    </select></label>
    <p className="muted">Each period averages the available ratings for each domain. Trends and comparisons use your latest 100 completions.</p>
    {recentTrends.map(({ period: bucket, entries }, index) => <details key={bucket} open={index === 0 || undefined}>
      <summary>{bucket}</summary>
      <table className="wheel-table"><caption>Average ratings for {bucket}</caption>
        <thead><tr><th scope="col">Domain</th><th scope="col">Average</th><th scope="col">Ratings</th></tr></thead>
        <tbody>{entries.map((entry, index) => <tr key={index}><th scope="row">{entry.label}</th><td>{entry.average}</td><td>{entry.count}</td></tr>)}</tbody>
      </table>
    </details>)}
  </>;
});

export function WheelOfLife({ domains: initial, assessments, id, revision, reflection, reminder, timezone, preview, centralized = false }: Props) {
  const [domains, setDomains] = useState(initial);
  const [highlighted, setHighlighted] = useState('');
  const [legacyReflection, setLegacyReflection] = useState(reflection);
  const [state, dispatch, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await saveWheel(previous, form);
    if (!result.error && form.get('intent') === 'complete') {
      setDomains(old => old.map(domain => ({ ...domain, rating: null, note: '', priority: false })));
      setLegacyReflection(undefined);
    }
    return result;
  }, { message: '' });
  const priorities = domains.filter(domain => domain.priority);
  function edit(id: string, fields: Partial<Domain>) {
    setDomains(old => old.map(domain => domain.id === id ? { ...domain, ...fields } : domain));
  }

  return <>
    <section className="panel growth-panel" aria-labelledby="wheel-assess">
      <h2 id="wheel-assess">Your assessment</h2>
      <p>Rate what feels right for you today. You choose what deserves attention. Different areas can matter at different times.</p>
      {assessments[0] && <p className="growth-status">Last completed on {localWheelDate(assessments[0].completed_at, timezone)}</p>}
      {legacyReflection && <p className="growth-note"><strong>Earlier draft note</strong> {legacyReflection}</p>}
      <form action={dispatch} className="wheel-layout">
        <fieldset disabled={pending} className="wheel-fields">
          <legend>Domains, ratings and priorities</legend>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="answers" value={JSON.stringify({ domains, reflection: legacyReflection })} />
          {domains.map((domain, index) => <fieldset key={domain.id} className="wheel-domain">
            <legend>{index + 1}. {domain.label || 'New domain'}</legend>
            <label>Domain name<input value={domain.label} maxLength={80} required onChange={event => edit(domain.id, { label: event.target.value })} /></label>
            <label htmlFor={'rating-' + domain.id}>Rating for {domain.label || 'new domain'}</label>
            <select id={'rating-' + domain.id} value={domain.rating ?? ''} onFocus={() => setHighlighted(domain.id)}
              onChange={event => edit(domain.id, { rating: event.target.value ? Number(event.target.value) : null })}>
              <option value="">Not rated</option>
              {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} / 10</option>)}
            </select>
            <label>Optional reflection<textarea value={domain.note} rows={2} maxLength={2000}
              onChange={event => edit(domain.id, { note: event.target.value })} /></label>
            <div className="wheel-options">
              <label className="wheel-check"><input type="checkbox" checked={domain.priority}
                onChange={event => edit(domain.id, { priority: event.target.checked })} /> Make this a priority</label>
              <button type="button" className="text-button" disabled={domains.length === 1} aria-label={'Remove ' + (domain.label || 'new domain')}
                onClick={() => setDomains(old => old.filter(item => item.id !== domain.id))}>Remove</button>
            </div>
          </fieldset>)}
          <div className="growth-actions">
            <button type="button" className="secondary" disabled={domains.length >= maxDomains}
              onClick={() => setDomains(old => [...old, { id: crypto.randomUUID(), label: '', rating: null, note: '', priority: false }])}>Add domain</button>
            <button type="button" className="text-button" onClick={() => {
              const byId = new Map(domains.map(domain => [domain.id, domain]));
              setDomains(emptyDomains().map(domain => ({ ...(byId.get(domain.id) ?? domain), label: domain.label })));
            }}>Restore default domains</button>
          </div>
          <div className="growth-actions">
            <button className="secondary" name="intent" value="draft" disabled={preview}>Save draft</button>
            <button className="primary" name="intent" value="complete" disabled={preview}>Complete assessment</button>
          </div>
          {state.message && <p className={state.error ? 'error' : 'growth-status'} role={state.error ? 'alert' : 'status'}>{state.message}</p>}
        </fieldset>
        <aside className="wheel-visual">
          <h3>Wheel preview</h3>
          <p className="muted">Choose a numbered axis to jump to its rating. The labeled rating fields give the exact values.</p>
          <Radar domains={domains} highlighted={highlighted} />
          <p className="muted">{domains.filter(domain => domain.rating !== null).length} of {domains.length} domains rated</p>
        </aside>
      </form>
    </section>
    <section className="panel growth-panel" aria-labelledby="wheel-goal">
      <h2 id="wheel-goal">Turn a priority into a goal</h2>
      <p>{priorities.length ? 'Your selected priorities: ' + priorities.map(domain => domain.label || 'New domain').join(', ')
        : 'Choose an area that matters to you and name one step you can take.'}</p>
      <StudioForm action={saveWheelGoal} className="stack wheel-settings">
        <label>Specific next step<input name="title" maxLength={140} placeholder="Example: Set aside 20 minutes to plan my week" required disabled={preview} /></label>
        <label>Target date (optional)<input name="date" type="date" disabled={preview} /></label>
        <button className="primary" disabled={preview}>Add to Growth Goals</button>
      </StudioForm>
      <Link className="text-button" href="/goals">Open Growth Goals</Link>
    </section>
    <section className="panel growth-panel wheel-history" aria-labelledby="wheel-history">
      <h2 id="wheel-history">Compare assessments</h2>
      <Comparison assessments={assessments} timezone={timezone} />
      {assessments.length > 0 && <a className="secondary" href={studioPath('/becoming/wheel-of-life/export')}>Export completed reflections (JSON)</a>}
    </section>
    <section className="panel growth-panel" aria-labelledby="wheel-reminder">
      <h2 id="wheel-reminder">Monthly reassessment reminder</h2>
      {centralized ? <Link className="text-button" href="/becoming/notifications">Manage Wheel of Life reminders</Link> : <>
      <p>Opt in to a reminder on your Personal Growth Dashboard. {reminder.due && 'Next reassessment: ' + reminder.due + '.'}</p>
      <StudioForm action={saveWheelReminder}>
        <button className="secondary" name="enabled" value={reminder.since ? 'no' : 'yes'} disabled={preview}>
          {reminder.since ? 'Disable monthly reminder' : 'Enable monthly reminder'}
        </button>
      </StudioForm>
      </>}
    </section>
  </>;
}
