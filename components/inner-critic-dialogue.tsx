'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import type { ActionState } from '../lib/actions';
import { addStatement, removeStatement, saveDialogue, sendDialogueToReframing } from '../lib/becoming/inner-critic-actions';
import {
  compassionateQuestions, criticQuestions, dialogueThemes, emptyDialogue, maxAnchors, maxExchanges, newExchange,
  type DialogueAnchor, type DialogueEntry, type DialogueExchange, type DialogueSnapshot, type Statement,
} from '../lib/becoming/inner-critic';
import { EmotionPicker } from './emotion-picker';
import { StudioForm } from './forms';

const criticTitle = 'The Inner Critic';
const compassionateTitle = 'My Reflective and Compassionate Voice';
type Question = typeof criticQuestions[number] | typeof compassionateQuestions[number];
type Props = {
  draft: DialogueEntry; history: DialogueSnapshot[]; statements: Statement[]; values: string[]; identities: string[];
  id: string; revision: string; timezone: string; preview: boolean;
};

function DialogueColumn({ title, questions, exchange, update }: {
  title: string; questions: readonly Question[]; exchange: DialogueExchange; update?: (key: Question[0], value: string) => void;
}) {
  return <section className="dialogue-column">
    <h4>{title}</h4>
    {update ? questions.map(([key, prompt]) => <label key={key} className="values-label">{prompt}
      <textarea rows={2} maxLength={2000} value={exchange[key]} onChange={event => update(key, event.target.value)} />
    </label>) : <dl className="thought-summary">{questions.filter(([key]) => exchange[key]).map(([key, prompt]) =>
      <div key={key}><dt>{prompt}</dt><dd>{exchange[key]}</dd></div>
    )}</dl>}
  </section>;
}

function DialogueHistory({ history, timezone }: Pick<Props, 'history' | 'timezone'>) {
  const date = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium' });
  return <section className="panel growth-panel thought-history" aria-labelledby="dialogue-history">
    <h2 id="dialogue-history">Saved dialogues</h2>
    {!history.length ? <p className="muted">Completed dialogues will appear here.</p> : <ol className="growth-list">
      {history.map(({ id, completedAt, entry }) => <li key={id}><details>
        <summary>Completed <time dateTime={completedAt}>{date.format(new Date(completedAt))}</time></summary>
        {entry.themes.length > 0 && <p>Themes: {entry.themes.join(', ')}</p>}
        {entry.emotions.length > 0 && <p>Emotions: {entry.emotions.join(', ')}</p>}
        {entry.anchors.length > 0 && <p>Values and identity: {entry.anchors.map(item => item.label).join(', ')}</p>}
        {entry.exchanges.map((exchange, index) => <section key={exchange.id} className="dialogue-exchange">
          <h3>Exchange {index + 1}</h3>
          <div className="dialogue-grid">
            <DialogueColumn title={criticTitle} questions={criticQuestions} exchange={exchange} />
            <DialogueColumn title={compassionateTitle} questions={compassionateQuestions} exchange={exchange} />
          </div>
        </section>)}
      </details></li>)}
    </ol>}
  </section>;
}

function ReframingDraft({ exchange, preview }: { exchange: DialogueExchange; preview: boolean }) {
  const [thought, setThought] = useState<string>();
  const [response, setResponse] = useState<string>();
  return <StudioForm action={sendDialogueToReframing} className="stack thought-form">
    <label className="values-label">Thought to copy<textarea name="thought" rows={2} maxLength={2000} value={thought ?? exchange.message}
      onChange={event => setThought(event.target.value)} /></label>
    <label className="values-label">Compassionate response to copy<textarea name="balanced" rows={2} maxLength={2000}
      value={response ?? exchange.response} onChange={event => setResponse(event.target.value)} /></label>
    <button className="secondary" disabled={preview}>Create reframing draft</button>
  </StudioForm>;
}

export function InnerCriticDialogue({ draft, history, statements, values, identities, id, revision, timezone, preview }: Props) {
  const [entry, setEntry] = useState(draft);
  const [valueChoice, setValueChoice] = useState('');
  const [identityChoice, setIdentityChoice] = useState('');
  const [statement, setStatement] = useState('');
  const [reframeSource, setReframeSource] = useState('');
  const [reframeChoice, setReframeChoice] = useState(draft.exchanges[0].id);
  const statementInput = useRef<HTMLTextAreaElement>(null);
  const [status, submit, saving] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await saveDialogue(previous, form);
    if (!result.error && form.get('intent') === 'complete') {
      const exchange = newExchange(crypto.randomUUID());
      setEntry({ ...emptyDialogue, exchanges: [exchange] });
      setReframeSource('');
      setReframeChoice(exchange.id);
    }
    return result;
  }, { message: '' });
  const [statementStatus, saveStatement, savingStatement] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await addStatement(previous, form);
    if (!result.error) setStatement('');
    return result;
  }, { message: '' });
  const savedSource = history.find(item => item.id === reframeSource);
  const sourceExchanges = savedSource?.entry.exchanges ?? entry.exchanges;
  const reframe = sourceExchanges.find(exchange => exchange.id === reframeChoice) ?? sourceExchanges[0];
  const savedDate = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium' });

  function addAnchor(kind: DialogueAnchor['kind'], label: string) {
    setEntry(old => old.anchors.length >= maxAnchors || old.anchors.some(item => item.kind === kind && item.label.toLowerCase() === label.toLowerCase())
      ? old : { ...old, anchors: [...old.anchors, { kind, label }] });
  }

  return <>
    <section className="panel growth-panel" aria-labelledby="dialogue-editor">
      <h2 id="dialogue-editor">Your dialogue</h2>
      <p>The two columns are a metaphor for different ways of talking to yourself. Use them to put self-critical thoughts and a realistic, compassionate response side by side. You can skip any prompt.</p>
      <form action={submit}>
        <fieldset className="thought-form" disabled={saving}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="entry" value={JSON.stringify(entry)} />
          <details>
            <summary>Choose themes (optional)</summary>
            <div className="emotion-options">{dialogueThemes.map(theme => <label className="values-option emotion-option" key={theme}>
              <input type="checkbox" checked={entry.themes.includes(theme)} onChange={event => {
                const checked = event.target.checked;
                setEntry(old => ({ ...old, themes: checked ? [...old.themes, theme] : old.themes.filter(item => item !== theme) }));
              }} />{theme}
            </label>)}</div>
          </details>
          <details>
            <summary>Explore emotions (optional)</summary>
            <EmotionPicker value={entry.emotions} onChange={emotions => setEntry(old => ({ ...old, emotions }))} disabled={saving} />
          </details>
          {entry.exchanges.map((exchange, index) => <section className="dialogue-exchange" key={exchange.id} aria-label={'Exchange ' + (index + 1)}>
            <h3>Exchange {index + 1}</h3>
            <div className="dialogue-grid">
              {([[criticTitle, criticQuestions], [compassionateTitle, compassionateQuestions]] as const).map(([title, questions]) =>
                <DialogueColumn key={title} title={title} questions={questions} exchange={exchange} update={(key, value) =>
                  setEntry(old => ({ ...old, exchanges: old.exchanges.map(item => item.id === exchange.id ? { ...item, [key]: value } : item) }))} />)}
            </div>
            <div className="growth-actions">
              <button type="button" className="text-button" disabled={!exchange.response.trim()} onClick={() => {
                setStatement(exchange.response.trim());
                statementInput.current?.focus();
              }}>Use response in collection</button>
              {entry.exchanges.length > 1 && <button type="button" className="text-button" aria-label={'Remove exchange ' + (index + 1)}
                onClick={() => setEntry(old => ({ ...old, exchanges: old.exchanges.filter(item => item.id !== exchange.id) }))}>Remove exchange</button>}
            </div>
          </section>)}
          <div className="growth-actions">
            <button type="button" className="secondary" disabled={entry.exchanges.length >= maxExchanges} onClick={() => {
              const exchange = newExchange(crypto.randomUUID());
              setEntry(old => ({ ...old, exchanges: [...old.exchanges, exchange] }));
            }}>Add exchange</button>
            <button className="secondary" name="intent" value="draft" disabled={preview}>Save draft</button>
            <button className="primary" name="intent" value="complete" disabled={preview}>Save dialogue</button>
          </div>
          {entry.exchanges.length >= maxExchanges && <p className="muted">This dialogue has reached its limit of {maxExchanges} exchanges.</p>}
          {status.message && <p className={status.error ? 'error' : 'growth-status'} role={status.error ? 'alert' : 'status'}>{status.message}</p>}
        </fieldset>
      </form>
    </section>

    <section className="panel growth-panel" aria-labelledby="dialogue-statements">
      <h2 id="dialogue-statements">Supportive statements</h2>
      <p>Keep something you’d like to read again, in your own words.</p>
      <form action={saveStatement}>
        <fieldset className="thought-form" disabled={savingStatement}>
          <label className="values-label">Supportive statement<textarea ref={statementInput} name="body" rows={3} maxLength={500}
            value={statement} onChange={event => setStatement(event.target.value)} required /></label>
          <button className="primary" disabled={preview || statement.length > 500}>Save supportive statement</button>
          {statement.length > 500 && <p className="muted">Shorten this to 500 characters to save it.</p>}
          {statementStatus.message && <p className={statementStatus.error ? 'error' : 'growth-status'}
            role={statementStatus.error ? 'alert' : 'status'}>{statementStatus.message}</p>}
        </fieldset>
      </form>
      {!statements.length ? <p className="muted">Your collection is empty.</p> : <ul className="growth-list">
        {statements.map(item => <li key={item.id}><p className="growth-note">{item.body}</p>
          <StudioForm action={removeStatement}>
            <input type="hidden" name="statementId" value={item.id} />
            <button className="text-button" aria-label={'Remove statement: ' + item.body}>Remove</button>
          </StudioForm>
        </li>)}
      </ul>}
    </section>

    <section className="panel growth-panel" aria-labelledby="dialogue-connections">
      <h2 id="dialogue-connections">Connect your reflection</h2>
      <p>Choose a core value or identity element you want to keep in mind. It will be included when you save this dialogue.</p>
      <div className="identity-actions">
        <Link href="/becoming/values-assessment" className="text-button">Open Values Assessment</Link>
        <Link href="/becoming/identity-mapping" className="text-button">Open Identity Mapping</Link>
      </div>
      {values.length > 0 && <div className="identity-actions">
        <label className="values-label">Core value<select value={valueChoice} onChange={event => setValueChoice(event.target.value)}>
          <option value="">Choose a value</option>{values.map(label => <option key={label}>{label}</option>)}
        </select></label>
        <button type="button" className="secondary" disabled={!valueChoice || entry.anchors.length >= maxAnchors}
          onClick={() => { addAnchor('value', valueChoice); setValueChoice(''); }}>Attach value</button>
      </div>}
      {identities.length > 0 && <div className="identity-actions">
        <label className="values-label">Identity element<select value={identityChoice} onChange={event => setIdentityChoice(event.target.value)}>
          <option value="">Choose an identity element</option>{identities.map(label => <option key={label}>{label}</option>)}
        </select></label>
        <button type="button" className="secondary" disabled={!identityChoice || entry.anchors.length >= maxAnchors}
          onClick={() => { addAnchor('identity', identityChoice); setIdentityChoice(''); }}>Attach identity element</button>
      </div>}
      {!values.length && !identities.length && <p className="muted">Complete a Values Assessment or save a dated Identity Map to attach items here.</p>}
      {entry.anchors.length > 0 && <ul className="emotion-chips" aria-label="Attached values and identity elements">{entry.anchors.map(item => (
        <li key={item.kind + item.label}><button type="button" className="secondary" aria-label={'Remove attachment: ' + item.label}
          onClick={() => setEntry(old => ({ ...old, anchors: old.anchors.filter(anchor => anchor.kind !== item.kind || anchor.label !== item.label) }))}>
          {item.label} ×</button></li>
      ))}</ul>}
      <details className="values-section">
        <summary>Continue in Cognitive Reframing</summary>
        <p>Review the two fields before copying them. Any existing reframing draft stays in place.</p>
        {history.length > 0 && <label className="values-label">Dialogue to copy from<select value={savedSource?.id ?? ''}
          onChange={event => { setReframeSource(event.target.value); setReframeChoice(''); }}>
          <option value="">Current dialogue</option>
          {history.map((item, index) => <option key={item.id} value={item.id}>
            Dialogue {history.length - index} · {savedDate.format(new Date(item.completedAt))}
          </option>)}
        </select></label>}
        <label className="values-label">Exchange to copy<select value={reframe.id} onChange={event => setReframeChoice(event.target.value)}>
          {sourceExchanges.map((exchange, index) => <option value={exchange.id} key={exchange.id}>Exchange {index + 1}</option>)}
        </select></label>
        <ReframingDraft exchange={reframe} preview={preview} key={(savedSource?.id ?? '') + reframe.id} />
        <Link href="/becoming/cognitive-reframing" className="text-button">Open Cognitive Reframing</Link>
      </details>
    </section>
    <DialogueHistory history={history} timezone={timezone} />
  </>;
}
