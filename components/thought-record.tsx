'use client';

import { useGrowthContent } from './growth-content-context';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { ActionState } from '../lib/actions';
import { EmotionPicker } from './emotion-picker';
import { saveThought, sendThoughtMood, sendThoughtToReframing } from '../lib/becoming/thought-actions';
import {
  cognitivePatterns, emptyThought, thoughtSteps, thoughtTextFields, type ThoughtEntry, type ThoughtSnapshot, type ThoughtTextKey,
} from '../lib/becoming/thought-record';
import { StudioForm } from './forms';

type Props = { draft: ThoughtEntry; history: ThoughtSnapshot[]; id: string; revision: string; timezone: string; preview: boolean; page: number; hasNext: boolean };

function snapshotLabel(snapshot: ThoughtSnapshot, dateFormat: Intl.DateTimeFormat) {
  return dateFormat.format(new Date(snapshot.completedAt));
}

function History({ history, dateFormat, page, hasNext }: Pick<Props, 'history' | 'page' | 'hasNext'> & { dateFormat: Intl.DateTimeFormat }) {
  return <section className="panel growth-panel thought-history" aria-labelledby="thought-history">
    <h2 id="thought-history">Private thought record history</h2>
    {!history.length ? <p className="muted">{page === 1 ? 'Completed entries will appear here.' : 'No entries on this page.'}</p> : <>
      <p className="muted">Newest saved first.</p>
      <ol className="growth-list">{history.map(({ id, record, completedAt }) => {
        const rows = [
          ['Date and time', record.date || record.time ? [record.date, record.time, record.timezone].filter(Boolean).join(' · ') : ''],
          [thoughtTextFields.situation, record.text.situation], [thoughtTextFields.automatic, record.text.automatic],
          ['Emotions experienced', record.emotions.join(', ')],
          ['Emotional intensity before reflection', record.before === null ? '' : record.before + ' / 100'],
          ...(['physical', 'behavior', 'supporting', 'otherEvidence', 'alternative', 'balanced'] as const).map(key => [thoughtTextFields[key], record.text[key]]),
          ['Emotional intensity after reflection', record.after === null ? '' : record.after + ' / 100'],
          [thoughtTextFields.action, record.text.action],
        ].filter(([, value]) => Boolean(value));
        return <li key={id}>
          <details>
            <summary>Saved <time dateTime={completedAt}>{dateFormat.format(new Date(completedAt))}</time></summary>
            {rows.length > 0 ? <dl className="thought-summary">{rows.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}</dl> : <p>No responses were saved for this entry.</p>}
          </details>
        </li>;
      })}</ol>
    </>}
    {(page > 1 || hasNext) && <nav aria-label="Thought record history pages" className="growth-actions">
      {page > 1 && <Link className="secondary" href={'?historyPage=' + (page - 1) + '#thought-history'}>Newer entries</Link>}
      {hasNext && <Link className="secondary" href={'?historyPage=' + (page + 1) + '#thought-history'}>Older entries</Link>}
    </nav>}
  </section>;
}

function ReframingForm({ record, preview }: { record: ThoughtEntry; preview: boolean }) {
  const [edits, setEdits] = useState<Partial<Record<'thought' | 'perspective' | 'balanced', string>>>({});
  const fields = [
    ['thought', 'Thought to explore', record.text.automatic],
    ['perspective', 'Perspective to carry forward', record.text.alternative],
    ['balanced', 'Helpful thought to carry forward', record.text.balanced],
  ] as const;
  return <StudioForm action={sendThoughtToReframing} className="stack thought-form">
    {fields.map(([key, label, original]) => <label className="values-label" key={key}>{label}
      <textarea name={key} rows={2} maxLength={2000} value={edits[key] ?? original ?? ''} onChange={event => {
        const value = event.target.value;
        setEdits(old => ({ ...old, [key]: value }));
      }} />
    </label>)}
    <button className="secondary" disabled={preview}>Create reframing draft</button>
  </StudioForm>;
}

function Connections({ draft, history, dateFormat, preview }: {
  draft: ThoughtEntry; history: ThoughtSnapshot[]; dateFormat: Intl.DateTimeFormat; preview: boolean;
}) {
  const [source, setSource] = useState('');
  const selected = history.find(entry => entry.id === source);
  const record = selected?.record ?? draft;
  const activeSource = selected?.id ?? '';
  return <section className="panel growth-panel" aria-labelledby="thought-connections">
    <h2 id="thought-connections">Continue your reflection</h2>
    {history.length > 0 && <label className="values-label">Use responses from
      <select value={activeSource} onChange={event => setSource(event.target.value)}>
        <option value="">Current entry</option>
        {history.map((entry, index) => <option key={entry.id} value={entry.id}>
          Entry {history.length - index} · {snapshotLabel(entry, dateFormat)}
        </option>)}
      </select></label>}
    <details>
      <summary>Take a thought to Cognitive Reframing</summary>
      <p>Review what you want to carry over. If you already have work in Cognitive Reframing, you can open it and add to it yourself.</p>
      <ReframingForm key={activeSource} record={record} preview={preview} />
      <Link className="text-button" href="/becoming/cognitive-reframing">Open Cognitive Reframing</Link>
    </details>
    <details>
      <summary>Take an emotion to Mood Tracker</summary>
      <p>If an emotion still describes how you feel, you can add it to today’s daily check-in. Any existing check-in stays in place.</p>
      {record.emotions.length > 0 ? <StudioForm action={sendThoughtMood} className="stack thought-form" key={activeSource + record.emotions.join('/')}>
        <label className="values-label">Emotion for today<select name="mood" defaultValue="" required>
          <option value="">Choose an emotion</option>{record.emotions.map(mood => <option key={mood}>{mood}</option>)}
        </select></label>
        <button className="secondary" disabled={preview}>Add to today’s check-in</button>
      </StudioForm> : <p className="muted">Select an emotion in the thought record to use it here.</p>}
      <Link className="text-button" href="/becoming/mood-tracker">Open Mood Tracker</Link>
    </details>
  </section>;
}

export function ThoughtRecord({ draft, history, id, revision, timezone, preview, page, hasNext }: Props) {
  const explanations = [...cognitivePatterns, ...useGrowthContent('education').map(item => [item.title, item.body] as const)];
  const [entry, setEntry] = useState(draft);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(entry.stage);
  useEffect(() => {
    if (previousStage.current !== entry.stage) heading.current?.focus();
    previousStage.current = entry.stage;
  }, [entry.stage]);
  const [state, dispatch, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await saveThought(previous, form);
    if (!result.error && form.get('intent') === 'complete') setEntry(emptyThought);
    return result;
  }, { message: '' });
  const { stage } = entry;
  const dateFormat = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium' });
  function textField(key: ThoughtTextKey) {
    return <label className="values-label">{thoughtTextFields[key]}<textarea rows={3} maxLength={2000} value={entry.text[key] ?? ''}
      onChange={event => {
        const value = event.target.value;
        setEntry(current => ({ ...current, text: { ...current.text, [key]: value } }));
      }} /></label>;
  }
  function rating(key: 'before' | 'after') {
    return <label className="values-label">{key === 'before' ? 'Emotional intensity before reflection' : 'Emotional intensity after reflection'} (0–100)
      <input type="number" min={0} max={100} step={1} value={entry[key] ?? ''} onChange={event => {
        const value = event.target.value;
        setEntry(current => ({ ...current, [key]: value === '' ? null : Number(value) }));
      }} /></label>;
  }

  return <>
    <section className="panel growth-panel thought-guide" aria-label="About the exercise">
      <p>Use this educational exercise for self-reflection. It is not a diagnosis or a substitute for professional care.</p>
      <p>Discrimination, abuse, and real threats deserve to be taken seriously. You can record what happened as you experienced it. A helpful next step may be seeking support, setting a boundary, or protecting your safety.</p>
      <details>
        <summary>Optional guide to common thinking patterns</summary>
        <p>Use these descriptions if they help you find a question worth considering. The exercise never labels your thoughts.</p>
        <dl className="thought-summary">{explanations.map(([title, description]) => (
          <div key={title}><dt>{title}</dt><dd>{description}</dd></div>
        ))}</dl>
      </details>
    </section>

    <section className="panel growth-panel" aria-labelledby="thought-step">
      <h2 id="thought-step" tabIndex={-1} ref={heading}>Step {stage} of {thoughtSteps.length} · {thoughtSteps[stage - 1]}</h2>
      <progress className="values-progress" aria-label="Thought record progress" value={stage} max={thoughtSteps.length} />
      <p className="muted">Every question is optional. Skip anything you’d rather leave blank.</p>
      {state.message && <p className={state.error ? 'error' : 'growth-status'} role={state.error ? 'alert' : 'status'}>{state.message}</p>}
      <form action={dispatch}>
        <fieldset className="thought-form" disabled={pending}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="record" value={JSON.stringify(entry)} />
          {stage === 1 && <>
            <div className="growth-actions">
              <label className="values-label">Date<input type="date" value={entry.date} onChange={event => {
                const date = event.target.value;
                setEntry(current => ({ ...current, date }));
              }} /></label>
              <label className="values-label">Time<input type="time" value={entry.time} onChange={event => {
                const time = event.target.value;
                setEntry(current => ({ ...current, time }));
              }} /></label>
            </div>
            <p className="muted">Time zone: {timezone}</p>
            {textField('situation')}
          </>}
          {stage === 2 && <>
            {textField('automatic')}
            <fieldset className="thought-form">
              <legend>Emotions experienced</legend>
              <p>Pick any that fit from the <Link className="text-button" href="/becoming/emotional-wheel">Emotional Wheel</Link>.</p>
              <EmotionPicker value={entry.emotions} onChange={emotions => setEntry(current => ({ ...current, emotions }))} quick />
            </fieldset>
            {rating('before')}
          </>}
          {stage === 3 && <>{textField('physical')}{textField('behavior')}</>}
          {stage === 4 && <>{textField('supporting')}{textField('otherEvidence')}{textField('alternative')}</>}
          {stage === 5 && <>{textField('balanced')}{rating('after')}{textField('action')}
            <p className="muted">Your feelings may change or stay the same. Either is okay.</p>
          </>}
          <div className="growth-actions thought-actions">
            {stage > 1 && <button type="button" className="secondary" onClick={() => setEntry(current => ({ ...current, stage: stage - 1 }))}>Back</button>}
            {stage < thoughtSteps.length && <button type="button" className="primary" onClick={() => setEntry(current => ({ ...current, stage: stage + 1 }))}>Next step</button>}
            <button className="secondary" name="intent" value="draft" disabled={preview}>Save draft</button>
            {stage === thoughtSteps.length && <button className="primary" name="intent" value="complete" disabled={preview}>Complete entry</button>}
          </div>
        </fieldset>
      </form>
    </section>

    <Connections draft={entry} history={history} dateFormat={dateFormat} preview={preview} />
    <History history={history} dateFormat={dateFormat} page={page} hasNext={hasNext} />
  </>;
}
