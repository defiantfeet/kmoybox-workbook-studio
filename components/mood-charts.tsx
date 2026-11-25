'use client';

import { useState } from 'react';
import { addDays, dateRange } from '../lib/becoming/habits';
import { average, type MoodRecord } from '../lib/becoming/mood';

type Point = { label: string; value: number | null; count: number };
const charts = ['Intraday mood changes', 'Weekly mood trends', 'Monthly mood trends', 'Emotional frequency',
  'Energy trends', 'Mood and habit co-occurrence', 'Mood and social interaction co-occurrence'] as const;
const shortDay = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const moodDay = (day: string) => shortDay.format(new Date(day + 'T00:00:00Z'));
export function moodTime(entry: MoodRecord) {
  return entry.occurredAt ? new Intl.DateTimeFormat('en', { timeZone: entry.timezone, timeStyle: 'short' }).format(new Date(entry.occurredAt))
    : 'Time not recorded';
}

export function MoodCharts({ entries, day, habits, social }: { entries: MoodRecord[]; day: string; habits: string[]; social: string[] }) {
  const [chart, select] = useState<typeof charts[number]>(charts[0]);
  const byDay = new Map<string, MoodRecord[]>();
  for (const entry of entries) {
    const daily = byDay.get(entry.day) ?? [];
    daily.push(entry);
    byDay.set(entry.day, daily);
  }
  let points: Point[];
  let units = 'Rating';
  let maximum = 10;
  let detail: string | undefined;
  if (chart === 'Intraday mood changes') {
    points = (byDay.get(day) ?? []).slice().reverse().map((entry, index) => ({
      label: moodTime(entry) + ' · Entry ' + (index + 1), ...average([entry.rating]),
    }));
  } else if (chart === 'Emotional frequency') {
    units = 'Check-ins';
    const counts = new Map<string, { label: string; count: number }>();
    for (const entry of entries) {
      for (const emotion of entry.emotions.length ? entry.emotions : entry.legacy ? [entry.legacy] : []) {
        const key = emotion.toLowerCase();
        const counted = counts.get(key);
        counts.set(key, { label: counted?.label ?? emotion, count: (counted?.count ?? 0) + 1 });
      }
    }
    points = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).map(item => ({ ...item, value: item.count }));
    maximum = Math.max(1, ...points.map(point => point.count));
    detail = 'Counts cover the 30 days ending on the selected date. A check-in can include more than one emotion.';
  } else if (chart.includes('co-occurrence')) {
    const isHabit = chart === 'Mood and habit co-occurrence';
    const linked = new Set(isHabit ? habits : social);
    const noun = isHabit ? 'completed habit' : 'social interaction';
    const rated = entries.filter(entry => entry.rating !== null);
    units = 'Average mood';
    points = [true, false].map(has => ({
      label: (has ? 'With a recorded ' : 'Without a recorded ') + noun,
      ...average(rated.filter(entry => linked.has(entry.day) === has).map(entry => entry.rating)),
    }));
    detail = 'These averages describe ratings recorded on the same calendar dates over 30 days. They do not show what caused a mood or whether an activity occurred before a check-in.';
  } else {
    const energy = chart === 'Energy trends';
    units = energy ? 'Average energy' : 'Average mood';
    const dates = dateRange(addDays(day, chart === 'Weekly mood trends' ? -6 : -29), day);
    points = dates.map(date => ({ label: moodDay(date), ...average((byDay.get(date) ?? []).map(entry => energy ? entry.energy : entry.rating)) }));
    detail = 'Each day shows the average of ratings actually recorded. Days without a rating remain blank.';
  }
  return <section className="panel growth-panel" aria-labelledby="mood-patterns">
    <h2 id="mood-patterns">Mood and energy patterns</h2>
    <label className="values-label">Visualization<select value={chart} onChange={event => select(event.target.value as typeof chart)}>
      {charts.map(item => <option key={item}>{item}</option>)}
    </select></label>
    {detail && <p>{detail}</p>}
    {points.length === 0 ? <p className="muted">No observations for this view.</p> : <div className="mood-chart-table">
      <table>
        <caption>{chart} · ending {moodDay(day)}</caption>
        <thead><tr><th scope="col">Observation</th><th scope="col">{units}</th>{units !== 'Check-ins' && <th scope="col">Ratings included</th>}</tr></thead>
        <tbody>{points.map(point => <tr key={point.label}>
          <th scope="row">{point.label}</th>
          <td>{point.value === null ? 'No rating' : <>
            <span>{point.value}{units !== 'Check-ins' && ' / 10'}</span>
            <span className="mood-bar" aria-hidden><span style={{ width: point.value / maximum * 100 + '%' }} /></span>
          </>}</td>
          {units !== 'Check-ins' && <td>{point.count}</td>}
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
