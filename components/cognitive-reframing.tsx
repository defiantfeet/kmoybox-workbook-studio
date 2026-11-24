'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { ActionState } from '../lib/actions';
import { loadThoughtImport, saveReframe } from '../lib/becoming/reframe-actions';
import { emptyReframe, fillReframeBlanks, perspectivePrompts, reframeFields, reframeSteps,
  type ReframeEntry, type ReframeField, type ReframeSnapshot, type ThoughtImportOption } from '../lib/becoming/reframing';
import { EmotionPicker } from './emotion-picker';

type Props = {
  draft: ReframeEntry; history: ReframeSnapshot[]; sources: ThoughtImportOption[];
  id: string; revision: string; timezone: string; preview: boolean;
};

function ReflectionPair({ entry }: { entry: ReframeEntry }) {
  return <div className="reframe-pair">
    <article aria-label="Before reframing">
      <h4>Before</h4>
      <dl className="thought-summary">
        <div><dt>Original thought</dt><dd>{entry.text.thought || 'No response'}</dd></div>
        <div><dt>Emotions</dt><dd>{entry.beforeEmotions.join(', ') || 'No response'}</dd></div>
        <div><dt>Intensity</dt><dd>{entry.before === null ? 'No rating' : entry.before + ' / 100'}</dd></div>
      </dl>
    </article>
    <article aria-label="After reframing">
      <h4>After</h4>
      <dl className="thought-summary">
        <div><dt>Balanced perspective</dt><dd>{entry.text.balanced || 'No response'}</dd></div>
        <div><dt>Emotions</dt><dd>{entry.afterEmotions.join(', ') || 'No response'}</dd></div>
        <div><dt>Intensity</dt><dd>{entry.after === null ? 'No rating' : entry.after + ' / 100'}</dd></div>
        <div><dt>What changed or stayed the same</dt><dd>{entry.text.change || 'No response'}</dd></div>
      </dl>
    </article>
  </div>;
}

function ThoughtImport({ sources, date, preview, onImport }: {
  sources: ThoughtImportOption[]; date: Intl.DateTimeFormat; preview: boolean; onImport: (entry: ReframeEntry) => void;
}) {
  const [chosen, setChosen] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [state, dispatch, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const { entry, ...result } = await loadThoughtImport(previous, form);
    if (entry) {
      onImport(entry);
      setConfirmed(false);
    }
    return result;
  }, { message: '' });

  return <section className="panel growth-panel" aria-labelledby="reframe-import">
    <h2 id="reframe-import">Start from a Thought Record</h2>
    {sources.length > 0 ? <form action={dispatch}>
      <fieldset className="thought-form" disabled={pending}>
        <p>Copy the thought, context, emotions, ratings, evidence, and next step into blank fields. Review and edit the draft before saving it.</p>
        <label className="values-label">Thought Record<select name="thoughtId" value={chosen} onChange={event => {
          setChosen(event.target.value);
          setConfirmed(false);
        }}>
          <option value="">Choose a saved record</option>
          {sources.map((item, index) => <option key={item.id} value={item.id}>
            {item.draft ? 'Draft' : 'Entry ' + (sources.length - index)} · {date.format(new Date(item.savedAt))}
          </option>)}
        </select></label>
        <label className="reframe-confirm"><input name="confirm" type="checkbox" value="yes" checked={confirmed}
          disabled={!chosen} onChange={event => setConfirmed(event.target.checked)} /> I want to copy from the selected Thought Record.</label>
        <button className="secondary" disabled={preview || !chosen || !confirmed}>Import into draft</button>
        {state.message && <p className={state.error ? 'error' : 'growth-status'} role={state.error ? 'alert' : 'status'}>{state.message}</p>}
      </fieldset>
    </form> : <p className="muted">Save a Thought Record to use it here.</p>}
    <Link href="/becoming/thought-record" className="text-button">Open Thought Record</Link>
  </section>;
}

export function CognitiveReframing({ draft, history, sources, id, revision, timezone, preview }: Props) {
  const [entry, setEntry] = useState(draft);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(draft.stage);
  const { stage } = entry;
  useEffect(() => {
    if (previousStage.current !== stage) heading.current?.focus();
    previousStage.current = stage;
  }, [stage]);
  const [state, dispatch, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await saveReframe(previous, form);
    if (!result.error && form.get('intent') === 'complete') setEntry(emptyReframe);
    return result;
  }, { message: '' });
  const date = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium' });

  function field(key: ReframeField) {
    return <label className="values-label">{reframeFields[key]}
      <textarea rows={3} maxLength={2000} value={entry.text[key] ?? ''} onChange={event => {
        const value = event.target.value;
        setEntry(old => ({ ...old, text: { ...old.text, [key]: value } }));
      }} />
    </label>;
  }

  function rating(key: 'before' | 'after') {
    return <label className="values-label">{key === 'before' ? 'Intensity before reflection' : 'Intensity after reflection'} (optional, 0–100)
      <input type="number" min={0} max={100} step={1} value={entry[key] ?? ''} onChange={event => {
        const value = event.target.value;
        setEntry(old => ({ ...old, [key]: value === '' ? null : Number(value) }));
      }} />
    </label>;
  }

  return <>
    <ThoughtImport sources={sources} date={date} preview={preview} onImport={imported => setEntry(old => fillReframeBlanks(old, imported))} />
    <section className="panel growth-panel" aria-labelledby="reframe-step">
      <h2 id="reframe-step" tabIndex={-1} ref={heading}>Step {stage} of {reframeSteps.length} · {reframeSteps[stage - 1]}</h2>
      <progress className="values-progress" aria-label="Reframing progress" value={stage} max={reframeSteps.length} />
      <p className="muted">Aim for a perspective that fits the evidence and your situation. Some concerns are well-founded. You can skip any prompt.</p>
      {state.message && <p className={state.error ? 'error' : 'growth-status'} role={state.error ? 'alert' : 'status'}>{state.message}</p>}
      <details>
        <summary>Optional perspective-taking prompts</summary>
        <ul className="growth-list">{perspectivePrompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul>
      </details>
      <form action={dispatch}>
        <fieldset className="thought-form" disabled={pending}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="record" value={JSON.stringify(entry)} />
          {stage === 1 && <>{field('thought')}{field('situation')}
            <details>
              <summary>Explore emotions (optional)</summary>
              <EmotionPicker value={entry.beforeEmotions} onChange={beforeEmotions => setEntry(old => ({ ...old, beforeEmotions }))} disabled={pending} />
            </details>
            {rating('before')}
          </>}
          {stage === 2 && <>
            <p>Describe what you heard, saw, or experienced. Then write what you think it meant.</p>
            {field('observations')}{field('interpretations')}
          </>}
          {stage === 3 && <>
            <p>Make room for what supports your concern, what complicates it, and what you still don’t know.</p>
            {field('supporting')}{field('conflicting')}{field('alternatives')}
          </>}
          {stage === 4 && <>
            <p>Other people’s choices and the conditions around you may limit what you can do.</p>
            {field('within')}{field('outside')}{field('balanced')}{field('next')}
          </>}
          {stage === 5 && <>
            <p>You might feel differently, the same, or unsure. Record what fits right now.</p>
            <details>
              <summary>Explore emotions after reflection (optional)</summary>
              <EmotionPicker value={entry.afterEmotions} onChange={afterEmotions => setEntry(old => ({ ...old, afterEmotions }))} disabled={pending} />
            </details>
            {rating('after')}{field('change')}
            <h3>Before-and-after reflection</h3>
            <ReflectionPair entry={entry} />
          </>}
          <div className="growth-actions thought-actions">
            {stage > 1 && <button type="button" className="secondary" onClick={() => setEntry(old => ({ ...old, stage: stage - 1 }))}>Back</button>}
            {stage < reframeSteps.length && <button type="button" className="primary" onClick={() => setEntry(old => ({ ...old, stage: stage + 1 }))}>Next step</button>}
            <button className="secondary" name="intent" value="draft" disabled={preview}>Save draft</button>
            {stage === reframeSteps.length && <button className="primary" name="intent" value="complete" disabled={preview}>Complete entry</button>}
          </div>
        </fieldset>
      </form>
    </section>

    <section className="panel growth-panel thought-history" aria-labelledby="reframe-history">
      <h2 id="reframe-history">Saved reframing entries</h2>
      {!history.length ? <p className="muted">Completed entries will appear here.</p> : <>
        <p className="muted">Showing your latest {history.length === 60 ? '60 ' : ''}completed entries.</p>
        <ol className="growth-list">{history.map(saved => <li key={saved.id}>
          <details><summary>Saved <time dateTime={saved.completedAt}>{date.format(new Date(saved.completedAt))}</time></summary>
            <ReflectionPair entry={saved.entry} />
            <details><summary>View other responses</summary>
              <dl className="thought-summary">{(Object.keys(reframeFields) as ReframeField[])
                .filter(key => key !== 'thought' && key !== 'balanced' && key !== 'change' && saved.entry.text[key])
                .map(key => <div key={key}><dt>{reframeFields[key]}</dt><dd>{saved.entry.text[key]}</dd></div>)}</dl>
            </details>
          </details>
        </li>)}</ol>
      </>}
    </section>
  </>;
}
