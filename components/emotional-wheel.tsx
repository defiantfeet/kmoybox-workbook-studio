'use client';

import Link from 'next/link';

import { useActionState, useState } from 'react';
import type { ActionState } from '../lib/actions';
import { saveEmotion } from '../lib/becoming/emotion-actions';
import { emptyEmotionNotes, type EmotionEntry, type SavedEmotion } from '../lib/becoming/emotions';
import { EmotionPicker } from './emotion-picker';

function EmotionHistory({ history, timezone, today }: { history: SavedEmotion[]; timezone: string; today: string }) {
  const [period, setPeriod] = useState('30');
  const todayDate = new Date(today + 'T00:00:00Z');
  todayDate.setUTCDate(todayDate.getUTCDate() - Number(period) + 1);
  const since = todayDate.toISOString().slice(0, 10);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const date = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' });
  const visible = history.filter(item => day.format(new Date(item.completedAt)) >= since);
  const counts = new Map<string, { label: string; count: number }>();
  for (const item of visible) {
    for (const label of item.entry.emotions) {
      const key = label.toLowerCase();
      const previous = counts.get(key);
      counts.set(key, { label: previous?.label ?? label, count: (previous?.count ?? 0) + 1 });
    }
  }
  const sorted = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const max = sorted[0]?.count ?? 1;
  return <section className="panel growth-panel" aria-labelledby="emotion-history">
    <h2 id="emotion-history">Emotion history</h2>
    {!history.length ? <p className="muted">Saved entries will appear here.</p> : <>
      <label className="values-label">History period<select value={period} onChange={event => setPeriod(event.target.value)}>
        <option value="30">Last 30 days</option><option value="90">Last 90 days</option>
      </select></label>
      <p className="muted">Counts show how many entries included each emotion, using up to 100 recent entries.</p>
      {sorted.length > 0 ? <table className="wheel-table emotion-history-table">
        <caption>Emotions recorded in the selected period</caption>
        <thead><tr><th scope="col">Emotion</th><th scope="col">Frequency</th><th scope="col">Entries</th></tr></thead>
        <tbody>{sorted.map(item => <tr key={item.label}><th scope="row">{item.label}</th>
          <td><div className="emotion-bar" aria-hidden style={{ width: item.count / max * 100 + '%' }} /></td><td>{item.count}</td></tr>)}</tbody>
      </table> : <p>No emotion entries in this period.</p>}
      <details>
        <summary>Browse all recent entries</summary>
        <ol className="growth-list">{history.map(({ id, entry, completedAt }) => <li key={id}>
          <details>
            <summary><time dateTime={completedAt}>{date.format(new Date(completedAt))}</time> · {entry.emotions.join(', ')}</summary>
            <dl className="thought-summary">
              {entry.intensity !== null && <div><dt>Intensity</dt><dd>{entry.intensity} / 100</dd></div>}
              {entry.sensations && <div><dt>Physical sensations</dt><dd>{entry.sensations}</dd></div>}
              {entry.context && <div><dt>Context</dt><dd>{entry.context}</dd></div>}
              {entry.reflection && <div><dt>Reflection</dt><dd>{entry.reflection}</dd></div>}
            </dl>
            <Link className="text-button" href={'/becoming/mood-tracker?emotionalEntry=' + id + '#mood-editor'}>
              Use these emotion labels in Mood Tracker
            </Link>
          </details>
        </li>)}</ol>
      </details>
    </>}
  </section>;
}

export function EmotionalWheel({ history, timezone, today, preview, draft }: {
  history: SavedEmotion[]; timezone: string; today: string; preview: boolean; draft: { id: string; revision: string; entry: EmotionEntry } | null;
}) {
  const [labels, setLabels] = useState<string[]>(draft?.entry.emotions ?? []);
  const [notes, setNotes] = useState(draft?.entry ?? emptyEmotionNotes);
  const [intensity, setIntensity] = useState('');
  const [state, dispatch, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await saveEmotion(previous, form);
    if (!result.error) {
      setLabels([]);
      setNotes(emptyEmotionNotes);
      setIntensity('');
    }
    return result;
  }, { message: '' });
  return <>
    <section className="panel growth-panel" aria-labelledby="emotion-entry">
      <h2 id="emotion-entry">KMOYBOX Emotional Wheel</h2>
      <p>Start broad or search for a word. The wheel gives you language to explore how you feel.</p>
      <form action={dispatch}>
        <fieldset className="thought-form" disabled={pending}>
          {draft && <p className="muted">You’re continuing your earlier emotion reflection.</p>}
          <input type="hidden" name="id" value={draft?.id ?? ''} />
          <input type="hidden" name="revision" value={draft?.revision ?? ''} />
          <EmotionPicker value={labels} onChange={setLabels} showWheel disabled={pending} />
          <input type="hidden" name="emotions" value={JSON.stringify(labels)} />
          <label className="values-label">Intensity (optional, 0–100)<input name="intensity" type="number" min={0} max={100} step={1}
            value={intensity} onChange={event => setIntensity(event.target.value)} /></label>
          {([['sensations', 'Physical sensations'], ['context', 'Context'], ['reflection', 'Reflection']] as const).map(([key, label]) => (
            <label key={key} className="values-label">{label} (optional)<textarea name={key} rows={2} maxLength={2000}
              value={notes[key]} onChange={event => { const value = event.target.value; setNotes(old => ({ ...old, [key]: value })); }} /></label>
          ))}
          <button className="primary" disabled={preview || !labels.length}>Save emotion entry</button>
          {state.message && <p className={state.error ? 'error' : 'growth-status'} role={state.error ? 'alert' : 'status'}>{state.message}</p>}
        </fieldset>
      </form>
    </section>
    <EmotionHistory history={history} timezone={timezone} today={today} />
  </>;
}
