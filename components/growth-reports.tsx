'use client';

import { useState } from 'react';
import Link from 'next/link';
import { deleteGrowthReport, saveGrowthReport, saveReportReminders } from '../lib/becoming/report-actions';
import { addDays } from '../lib/becoming/habits';
import { metricLabel, reportCategories, reportDataKeys, reportDateLabel, reportKeys, reportKinds, reportLabels, reportQuestions, reportsPath,
  type ReportCategory, type ReportKind, type ReportPeriod, type ReportResponses, type ReportSnapshot, type SavedReport } from '../lib/becoming/reports';
import { StudioForm } from './forms';

type Comparison = ReportPeriod & { through: string; categories: ReportCategory[]; snapshot: ReportSnapshot; saved: boolean };
type History = { id: string; period_start: string; period_end: string }[];
type Notice = { prefs: Record<ReportKind, boolean>; available: { kind: ReportKind; day: string }[] };
type Props = {
  kind: ReportKind; period: ReportPeriod; through: string; timezone: string; today: string;
  history: History; reminders: Notice; snapshot: ReportSnapshot; stored: SavedReport | null;
  comparison: Comparison | null; centralized?: boolean; preview: boolean; saved: boolean; deleted: boolean;
};
const href = (kind: ReportKind, day?: string) => reportsPath + '?kind=' + kind + (day ? '&day=' + day : '');
const dateSpan = (start: string, end: string) => reportDateLabel(start) + '–' + reportDateLabel(end);

function ReportComparison({ comparison, snapshot, categories, through, period }: {
  comparison: Comparison; snapshot: ReportSnapshot; categories: ReportCategory[]; through: string; period: ReportPeriod;
}) {
  const results = reportDataKeys.filter(key => categories.includes(key) && comparison.categories.includes(key)).flatMap(key => {
    const now = new Map(snapshot[key]?.metrics.map(metric => [metric.label, metric]));
    const then = new Map(comparison.snapshot[key]?.metrics.map(metric => [metric.label, metric]));
    return [...new Set([...now.keys(), ...then.keys()])].map(label => ({
      key: key + label, label: reportCategories[key] + ' · ' + label,
      today: now.get(label), earlier: then.get(label),
    }));
  });
  return <>
    <p>{comparison.saved ? 'Compared with a saved report.' : 'Compared with a preview from your records.'}
      {' '}The table includes categories visible in both periods. Partial periods may cover different numbers of days.</p>
    {results.length ? <div className="mood-chart-table"><table>
      <caption>Recorded activity by period</caption>
      <thead><tr><th scope="col">Measure</th><th scope="col">{dateSpan(comparison.start, comparison.end)}<br />Through {reportDateLabel(comparison.through)}</th>
        <th scope="col">{dateSpan(period.start, period.end)}<br />Through {reportDateLabel(through)}</th></tr></thead>
      <tbody>{results.map(row => <tr key={row.key}><th scope="row">{row.label}</th>
        <td>{row.earlier ? metricLabel(row.earlier) : 'No data'}</td><td>{row.today ? metricLabel(row.today) : 'No data'}</td>
      </tr>)}</tbody>
    </table></div> : <p className="muted">No shared measures are available for these periods.</p>}
  </>;
}

export function GrowthReports({ kind, period, through, timezone, today, history, reminders, snapshot, stored, comparison,
  preview, saved, deleted, centralized = false }: Props) {
  const [categories, setCategories] = useState(stored?.categories ?? reportKeys);
  const [responses, setResponses] = useState<ReportResponses>(stored?.reflections ?? {});
  const [confirmed, confirm] = useState(false);
  const [weeklyReminder, setWeeklyReminder] = useState(reminders.prefs.weekly);
  const [monthlyReminder, setMonthlyReminder] = useState(reminders.prefs.monthly);
  const earlier = history.filter(report => report.period_start < period.start);
  return <div className="growth-module-content">
    <section className="panel growth-panel" aria-labelledby="report-heading">
      <h2 id="report-heading" tabIndex={-1}>{reportLabels[kind]}</h2>
      {saved && <p role="status">Growth report saved.</p>}
      {deleted && <p role="status">Growth report deleted.</p>}
      {preview && <p className="muted">Sign in to generate a report from your records.</p>}
      <nav className="growth-actions" aria-label="Report frequency">
        {reportKinds.map(value => <Link key={value} aria-current={kind === value ? 'page' : undefined} href={href(value, period.start)}>
          {value === 'weekly' ? 'Weekly' : 'Monthly'}
        </Link>)}
      </nav>
      <p><strong>{dateSpan(period.start, period.end)}</strong> · {timezone}</p>
      <p>{stored ? 'Saved summary' : 'Preview'} · Records through {reportDateLabel(through)}</p>
      <form action={reportsPath} className="growth-actions report-date-form">
        <input name="kind" type="hidden" value={kind} />
        <label className="values-label">Choose a date in the period<input type="date" name="day" min="1900-01-01" max={today}
          defaultValue={period.start} required /></label>
        <button className="secondary">View report period</button>
      </form>
      <nav className="growth-actions" aria-label="Report periods">
        {period.start > '1900-01-01' && <Link href={href(kind, addDays(period.start, -1))}>Earlier period</Link>}
        {addDays(period.end, 1) <= today && <Link href={href(kind, addDays(period.end, 1))}>Later period</Link>}
        <Link href={href(kind)}>Current period</Link>
      </nav>
    </section>

    <section className="panel growth-panel" aria-labelledby="report-editor">
      <h2 id="report-editor">Edit reflections and categories</h2>
      <p>Answer any of the questions. Saving refreshes the selected categories from your records and keeps a private copy for this period.</p>
      <StudioForm action={saveGrowthReport.bind(null, kind, period.start, stored?.id ?? '', stored?.revision ?? '')} className="stack growth-form">
        <fieldset className="onboarding-checks">
          <legend>Categories to include in the report and PDF</legend>
          {reportKeys.map(key => <label className="habit-check" key={key}>
            <input type="checkbox" name="category" value={key} checked={categories.includes(key)} onChange={event =>
              setCategories(current => event.target.checked ? [...current, key] : current.filter(item => item !== key))} /> {reportCategories[key]}
          </label>)}
        </fieldset>
        <div className="future-grid">
          {Object.entries(reportQuestions).map(([key, question]) => {
            const field = key as keyof ReportResponses;
            return <label key={key}>{question}<textarea name={'answer-' + key} rows={3} maxLength={2000} value={responses[field] ?? ''}
              onChange={event => setResponses(current => ({ ...current, [field]: event.target.value }))} /></label>;
          })}
        </div>
        <button className="primary" disabled={preview}>Save growth report</button>
      </StudioForm>
      {stored && <div className="report-manage">
        <a className="text-button" href={reportsPath + '/' + stored.id + '/pdf'} download>Download saved report as PDF</a>
        <details><summary>Delete this report</summary>
          <StudioForm action={deleteGrowthReport.bind(null, stored.id, stored.revision)} className="stack growth-form">
            <label className="habit-check"><input type="checkbox" name="confirm" value="yes" checked={confirmed}
              onChange={event => confirm(event.target.checked)} /> Confirm report deletion</label>
            <button className="secondary" disabled={!confirmed}>Delete growth report permanently</button>
          </StudioForm>
        </details>
      </div>}
    </section>

    <div className="insights-grid">
      {reportDataKeys.filter(key => categories.includes(key)).map(key => {
        const data = snapshot[key];
        return <section className="panel growth-panel insights-card" key={key} aria-labelledby={'report-' + key}>
          <h2 id={'report-' + key}>{reportCategories[key]}</h2>
          {data?.metrics.length ? <dl className="growth-list">
            {data.metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metricLabel(metric)}</dd></div>)}
          </dl> : <p className="muted">{stored && !stored.categories.includes(key) ? 'Save this report to include this category.' : 'No recorded data in this period.'}</p>}
          {data && data.lines.length > 0 && <ul className="growth-list">{data.lines.map((line, index) => <li key={index}>
            {line.day && <><time dateTime={line.day}>{reportDateLabel(line.day)}</time> · </>}{line.text}
          </li>)}</ul>}
        </section>;
      })}
      {categories.includes('guided') && <section className="panel growth-panel insights-card" aria-labelledby="report-guided">
        <h2 id="report-guided">{reportCategories.guided}</h2>
        {Object.values(responses).some(value => value?.trim()) ? <dl className="growth-list">
          {Object.entries(reportQuestions).map(([key, question]) => {
            const response = responses[key as keyof ReportResponses];
            return response?.trim() && <div key={key}><dt>{question}</dt><dd className="growth-note">{response}</dd></div>;
          })}
        </dl> : <p className="muted">No guided reflections entered.</p>}
      </section>}
    </div>

    <section className="panel growth-panel" aria-labelledby="report-compare">
      <h2 id="report-compare" tabIndex={-1}>Compare previous periods</h2>
      <div className="growth-actions">
        {period.start > '1900-01-07' && <Link className="text-button" href={href(kind, period.start) + '&compare=previous#report-compare'}>Compare with the previous period</Link>}
        {comparison && <Link className="text-button" href={href(kind, period.start) + '#report-compare'}>Clear comparison</Link>}
      </div>
      {earlier.length > 0 && <form action={reportsPath} className="growth-actions report-date-form">
        <input name="kind" type="hidden" value={kind} />
        <input name="day" type="hidden" value={period.start} />
        <label className="values-label">Earlier saved report<select name="compare">{earlier.map(item =>
          <option key={item.id} value={item.id}>{dateSpan(item.period_start, item.period_end)}</option>)}</select></label>
        <button className="secondary">Compare saved report</button>
      </form>}
      {comparison && <ReportComparison comparison={comparison} categories={categories} snapshot={snapshot} through={through} period={period} />}
    </section>

    <section className="panel growth-panel" aria-labelledby="report-history">
      <h2 id="report-history">Saved {kind} reports</h2>
      {history.length ? <ul className="growth-list">{history.map(item => <li key={item.id}>
        <Link href={href(kind, item.period_start)}>{dateSpan(item.period_start, item.period_end)}</Link>
      </li>)}</ul> : <p className="muted">Save a report to revisit it here.</p>}
    </section>

    <section className="panel growth-panel" aria-labelledby="report-reminders">
      <h2 id="report-reminders">Report reminders</h2>
      {centralized ? <Link className="text-button" href="/becoming/notifications">Manage Growth Report reminders</Link> : <>
      <p>Enable a generic in-app notice when a completed period is available to review.</p>
      <StudioForm action={saveReportReminders} className="stack growth-form">
        <label className="habit-check"><input type="checkbox" name="weekly" value="yes" checked={weeklyReminder}
          onChange={event => setWeeklyReminder(event.target.checked)} /> Weekly report reminders</label>
        <label className="habit-check"><input type="checkbox" name="monthly" value="yes" checked={monthlyReminder}
          onChange={event => setMonthlyReminder(event.target.checked)} /> Monthly report reminders</label>
        <button className="primary" disabled={preview}>Save report reminder preferences</button>
      </StudioForm></>}
    </section>
  </div>;
}
