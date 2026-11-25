'use client';

import { useGrowthContent } from './growth-content-context';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { ActionState } from '../lib/actions';
import { connectValue, saveValues } from '../lib/becoming/values-actions';
import {
  emptyValues, practiceLabels, valueGroups, valueLibrary, valuePrompts,
  type PracticeKind, type PromptKey, type ValueDefinition, type ValuePractice, type ValuesDraft, type ValuesVersion,
} from '../lib/becoming/values';
import { StudioForm } from './forms';

const stages = [
  'Explore personal values', 'Select important values', 'Narrow to ten values',
  'Identify five core values', 'Rank your core values', 'Reflect on your core values',
];

type Props = {
  draft: ValuesDraft; history: ValuesVersion[]; legacy: { id: string; completed_at: string; earlier: string[] }[];
  practices: ValuePractice[]; id: string; revision: string; timezone: string; preview: boolean;
};

function valueIndex(custom: ValueDefinition[]) {
  return new Map([...valueLibrary, ...custom].map(entry => [entry.id, entry]));
}

function Picker({ values, selected, limit, onChange }: {
  values: ValueDefinition[]; selected: string[]; limit: number; onChange: (ids: string[]) => void;
}) {
  return <div className="values-options">
    {values.map(value => <label className="values-option" key={value.id}>
      <input type="checkbox" checked={selected.includes(value.id)}
        disabled={selected.length >= limit && !selected.includes(value.id)}
        onChange={event => onChange(event.target.checked ? [...selected, value.id] : selected.filter(id => id !== value.id))} />
      <span><strong>{value.label}</strong><small>{value.definition}</small></span>
    </label>)}
  </div>;
}

const statementTemplates = {
  principles: 'The values I choose to live by are {values}.',
  practice: 'In everyday life, I want to make more room for {values}.',
};

function ValuesStatement({ draft, names, onChange }: {
  draft: ValuesDraft; names: Map<string, ValueDefinition>; onChange: (value: string) => void;
}) {
  const [template, setTemplate] = useState<keyof typeof statementTemplates>('principles');
  const [opening, setOpening] = useState(statementTemplates.principles);
  const [included, setIncluded] = useState<string[]>([]);
  const [templateError, setTemplateError] = useState('');
  const options = draft.ranked.flatMap(id => valuePrompts.flatMap(([key, label]) => {
    const text = draft.responses[id]?.[key]?.trim();
    return text ? [{ id: id + '/' + key, name: names.get(id)?.label, label, text }] : [];
  }));
  function generate() {
    const values = new Intl.ListFormat('en', { type: 'conjunction' }).format(draft.ranked.map(id => names.get(id)?.label ?? id));
    const intro = opening.trim().replaceAll('{values}', () => values);
    const lines = options.filter(option => included.includes(option.id)).map(option => option.name + ' — ' + option.text);
    const text = [intro, ...lines].filter(Boolean).join('\n\n');
    if (text.length > 10000) {
      setTemplateError('Choose fewer responses to keep the statement within 10,000 characters.');
      return;
    }
    setTemplateError('');
    onChange(text);
  }
  return <section className="values-section" aria-labelledby="values-statement">
    <h3 id="values-statement">Personal values statement</h3>
    <p>Choose a template and the responses you want to include. You can edit the resulting statement or write your own.</p>
    <label className="values-label">Statement template<select value={template} onChange={event => {
      const key = event.target.value as keyof typeof statementTemplates;
      setTemplate(key);
      setOpening(statementTemplates[key]);
    }}>
      <option value="principles">Principles I choose</option><option value="practice">How I want to live</option>
    </select></label>
    <label className="values-label">Template opening<textarea rows={2} value={opening} maxLength={500}
      onChange={event => setOpening(event.target.value)} /></label>
    <p className="muted">Use <code>{'{values}'}</code> to insert your core values in rank order.</p>
    {options.length > 0 && <details>
      <summary>Choose responses to include ({included.filter(id => options.some(option => option.id === id)).length} selected)</summary>
      <div className="values-options">
        {options.map(option => <label key={option.id} className="values-option">
          <input type="checkbox" checked={included.includes(option.id)} onChange={event => setIncluded(old =>
            event.target.checked ? [...old, option.id] : old.filter(id => id !== option.id))} />
          <span><strong>{option.name} · {option.label}</strong><small>{option.text}</small></span>
        </label>)}
      </div>
    </details>}
    <button type="button" className="secondary" onClick={generate}>{draft.statement ? 'Replace statement with template' : 'Generate editable statement'}</button>
    {templateError && <p role="alert" className="error">{templateError}</p>}
    <label className="values-label">Your values statement<textarea rows={5} maxLength={10000}
      value={draft.statement} onChange={event => onChange(event.target.value)} /></label>
  </section>;
}

function Practice({ assessment, practices }: { assessment: ValuesVersion; practices: ValuePractice[] }) {
  const names = valueIndex(assessment.answers.custom);
  const [value, setValue] = useState(assessment.answers.ranked[0]);
  const [kind, setKind] = useState<PracticeKind>('habit');
  const suggested = (id: string, type: PracticeKind) => (assessment.answers.responses[id]?.week ?? '').slice(0, type === 'habit' ? 80 : 140);
  const [step, setStep] = useState(() => suggested(value, kind));
  const linked = practices.filter(practice => practice.assessment_id === assessment.id);
  return <section className="values-section" aria-labelledby="values-practice">
    <h3 id="values-practice">Put a core value into practice</h3>
    <p>Create a habit or goal, or connect a Boundary Builder or Social Integration exercise. Existing exercise answers stay in place.</p>
    <StudioForm action={connectValue} className="stack values-form">
      <input type="hidden" name="assessment" value={assessment.id} />
      <label className="values-label">Core value<select name="value" value={value} onChange={event => {
        setValue(event.target.value);
        setStep(suggested(event.target.value, kind));
      }}>
        {assessment.answers.ranked.map(id => <option key={id} value={id}>{names.get(id)?.label}</option>)}
      </select></label>
      <label className="values-label">Practice type<select name="kind" value={kind} onChange={event => {
        const type = event.target.value as PracticeKind;
        setKind(type);
        setStep(suggested(value, type));
      }}>
        {Object.entries(practiceLabels).map(([key, option]) => <option key={key} value={key}>{option.title}</option>)}
      </select></label>
      <label className="values-label">Small next step<input name="step" required maxLength={kind === 'habit' ? 80 : 140}
        value={step} onChange={event => setStep(event.target.value)} /></label>
      <button className="primary" disabled={linked.some(item => item.value_key === value && item.kind === kind)}>Connect practice</button>
    </StudioForm>
    {linked.length > 0 && <ul className="growth-list">{linked.map(practice => <li key={practice.id}>
      {names.get(practice.value_key)?.label} · <Link href={practiceLabels[practice.kind].href}>{practiceLabels[practice.kind].title}</Link>
      <p>{practice.next_step}</p>
    </li>)}</ul>}
  </section>;
}

function History({ history, legacy, practices, timezone }: Pick<Props, 'history' | 'legacy' | 'practices' | 'timezone'>) {
  const [chosen, setChosen] = useState('');
  const version = history.find(entry => entry.id === chosen) ?? history[0];
  const date = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium' });
  const names = version ? valueIndex(version.answers.custom) : null;
  return <section className="panel growth-panel" aria-labelledby="values-history">
    <h2 id="values-history">Saved assessments</h2>
    {!version && !legacy.length && <p className="muted">Complete an assessment to revisit your core values and connect them to activities.</p>}
    {version && names && <>
      <label className="values-label">Assessment version<select value={version.id} onChange={event => setChosen(event.target.value)}>
        {history.map(entry => <option value={entry.id} key={entry.id}>{date.format(new Date(entry.completed_at))}</option>)}
      </select></label>
      <p className="growth-note">{version.answers.statement}</p>
      <ol className="values-ranked">{version.answers.ranked.map(id => <li key={id}><details>
        <summary>{names.get(id)?.label}</summary>
        <dl>{valuePrompts.map(([key, label]) => <div key={key}>
          <dt><strong>{label}</strong></dt><dd className="growth-note">{version.answers.responses[id]?.[key] || 'No response saved.'}</dd>
        </div>)}</dl>
      </details></li>)}</ol>
      <Practice assessment={version} practices={practices} key={version.id} />
    </>}
    {legacy.map(entry => <details key={entry.id}>
      <summary>Earlier reflection · {date.format(new Date(entry.completed_at))}</summary>
      {entry.earlier.map((note, index) => <p className="growth-note" key={index}>{note}</p>)}
    </details>)}
  </section>;
}

export function ValuesAssessment({ draft: initial, history, legacy, practices, id, revision, timezone, preview }: Props) {
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState('');
  const suggestions = useGrowthContent('value');
  const [customName, setCustomName] = useState('');
  const [customDefinition, setCustomDefinition] = useState('');
  const [customError, setCustomError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(draft.stage);
  useEffect(() => {
    if (previousStage.current !== draft.stage) heading.current?.focus();
    previousStage.current = draft.stage;
  }, [draft.stage]);
  const [state, dispatch, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await saveValues(previous, form);
    if (!result.error && form.get('intent') === 'complete') setDraft(old => ({ ...emptyValues, custom: old.custom }));
    return result;
  }, { message: '' });

  const names = valueIndex(draft.custom);
  const matching = (value: ValueDefinition) => (value.label + ' ' + value.definition).toLowerCase().includes(query.trim().toLowerCase());
  const library = [...valueLibrary, ...draft.custom].filter(matching);
  const fromIds = (ids: string[]) => ids.flatMap(id => names.get(id) ?? []);
  const { stage, selected, shortlist, ranked } = draft;
  const canAdvance = stage === 2 ? selected.length >= 10 : stage === 3 ? shortlist.length === 10 : stage === 4 ? ranked.length === 5 : true;
  function advance(step: number) {
    setQuery('');
    setDraft(old => ({
      ...old, stage: old.stage + step,
      shortlist: step === 1 && old.stage === 2 && old.selected.length === 10 ? [...old.selected] : old.shortlist,
    }));
  }
  function addCustom() {
    const label = customName.trim();
    const definition = customDefinition.trim();
    if (!label || !definition || [...names.values()].some(value => value.label.toLowerCase() === label.toLowerCase())) {
      setCustomError('Enter a unique name and a short definition.');
      return;
    }
    if (draft.custom.length >= 15) return;
    setDraft(old => ({ ...old, custom: [...old.custom, { id: 'custom-' + crypto.randomUUID(), label, definition }] }));
    setQuery(label);
    setCustomName('');
    setCustomDefinition('');
    setCustomError('');
  }
  function changeRank(index: number, direction: number) {
    const order = [...ranked];
    const adjacent = index + direction;
    [order[index], order[adjacent]] = [order[adjacent], order[index]];
    setDraft(old => ({ ...old, ranked: order }));
  }
  function reflect(id: string, key: PromptKey, text: string) {
    setDraft(old => {
      const entry = { ...old.responses[id], [key]: text };
      const responses = { ...old.responses };
      if (Object.values(entry).some(answer => answer.trim())) responses[id] = entry;
      else delete responses[id];
      return { ...old, responses };
    });
  }

  return <>
    <section className="panel growth-panel" aria-labelledby="values-stage">
      <p className="muted">A guided reflection exercise. This activity has no score and is not a validated psychological test.</p>
      <h2 id="values-stage" tabIndex={-1} ref={heading}>Stage {stage} of 6 · {stages[stage - 1]}</h2>
      <progress className="values-progress" aria-label="Assessment stage" value={stage} max={6} />
      {state.message && <p className={state.error ? 'error' : 'growth-status'} role={state.error ? 'alert' : 'status'}>{state.message}</p>}
      <a className="text-button" href="#values-controls">Go to stage controls</a>
      {Boolean(draft.earlier?.length) && <details><summary>Notes from your earlier draft</summary>
        {draft.earlier?.map((note, index) => <p key={index} className="growth-note">{note}</p>)}
      </details>}
      <form action={dispatch}>
        <fieldset className="values-form" disabled={pending}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="answers" value={JSON.stringify(draft)} />
          {stage <= 2 && <>
            {stage === 1 ? <p>Read through {valueLibrary.length} values and notice which ones you want to live by.</p>
              : <p role="status">{selected.length} of 15 selected. Choose at least ten so you can make a shortlist.</p>}
            <label className="values-label">Search values<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <details className="values-section">
              <summary>Add a custom value</summary>
              {suggestions.length > 0 && <label className="values-label">Studio value suggestions<select value="" onChange={event => {
                const item = suggestions.find(value => value.item_id === event.target.value);
                if (item) { setCustomName(item.title.slice(0, 80)); setCustomDefinition(item.body.slice(0, 240)); }
              }}><option value="">Choose a starting point</option>{suggestions.map(item =>
                <option key={item.item_id} value={item.item_id}>{item.title}</option>)}</select></label>}
              <label className="values-label">Custom value name<input value={customName} maxLength={80} onChange={event => setCustomName(event.target.value)} /></label>
              <label className="values-label">Definition<textarea rows={2} value={customDefinition} maxLength={240}
                onChange={event => setCustomDefinition(event.target.value)} /></label>
              <button type="button" className="secondary" onClick={addCustom} disabled={draft.custom.length >= 15}>Add custom value</button>
              {customError && <p role="alert" className="error">{customError}</p>}
            </details>
            {!library.length && <p>No values match your search.</p>}
            {stage === 1 && [...valueGroups, { title: 'Your custom values', values: draft.custom }].map(group => {
              const entries = group.values.filter(matching);
              return entries.length > 0 && <section key={group.title} className="values-section">
                <h3>{group.title}</h3>
                <dl className="values-options">{entries.map(value => <div className="values-definition" key={value.id}>
                  <dt><strong>{value.label}</strong></dt><dd>{value.definition}</dd>
                </div>)}</dl>
              </section>;
            })}
            {stage === 2 && <>
              {selected.length > 0 && <p className="muted">Selected: {fromIds(selected).map(value => value.label).join(', ')}</p>}
              <Picker values={library} selected={selected} limit={15} onChange={ids => setDraft(old => {
                const shortlist = old.shortlist.filter(id => ids.includes(id));
                return { ...old, selected: ids, shortlist, ranked: old.ranked.filter(id => shortlist.includes(id)) };
              })} />
            </>}
          </>}
          {stage === 3 && <>
            <p role="status">{shortlist.length} of 10 shortlisted. Choose the ten that best reflect the choices you want to make.</p>
            <Picker values={fromIds(selected)} selected={shortlist} limit={10} onChange={ids => setDraft(old =>
              ({ ...old, shortlist: ids, ranked: old.ranked.filter(id => ids.includes(id)) }))} />
          </>}
          {stage === 4 && <>
            <p role="status">{ranked.length} of 5 core values selected.</p>
            <Picker values={fromIds(shortlist)} selected={ranked} limit={5} onChange={ids => setDraft(old =>
              ({ ...old, ranked: ids }))} />
          </>}
          {stage === 5 && <>
            <p>Move each value up or down until the order reflects how you want to prioritize them right now.</p>
            <ol className="values-ranked">{fromIds(ranked).map((value, index) => <li key={value.id}>
              <div className="values-rank-row"><strong>{value.label}</strong>
                <button type="button" className="secondary" disabled={index === 0} onClick={() => changeRank(index, -1)} aria-label={'Move ' + value.label + ' up'}>Move up</button>
                <button type="button" className="secondary" disabled={index === ranked.length - 1} onClick={() => changeRank(index, 1)}
                  aria-label={'Move ' + value.label + ' down'}>Move down</button>
              </div>
            </li>)}</ol>
          </>}
          {stage === 6 && <>
            <p>Reflect at your own pace. You can leave a question blank and return later.</p>
            {fromIds(ranked).map((value, index) => <fieldset className="values-reflection" key={value.id}>
              <legend>{index + 1}. {value.label}</legend>
              {valuePrompts.map(([key, label]) => <label className="values-label" key={key}>{label}
                <textarea rows={2} maxLength={1500} value={draft.responses[value.id]?.[key] ?? ''}
                  onChange={event => reflect(value.id, key, event.target.value)} />
              </label>)}
            </fieldset>)}
            <ValuesStatement draft={draft} names={names} onChange={statement => setDraft(old => ({ ...old, statement }))} />
          </>}
          <div className="growth-actions values-actions" id="values-controls" tabIndex={-1}>
            {stage > 1 && <button type="button" className="secondary" onClick={() => advance(-1)}>Back</button>}
            {stage < 6 && <button type="button" className="primary" disabled={!canAdvance} onClick={() => advance(1)}>Next stage</button>}
            <button className="secondary" name="intent" value="draft" disabled={preview}>Save draft</button>
            {stage === 6 && <button className="primary" name="intent" value="complete" disabled={preview}>Complete assessment</button>}
          </div>
        </fieldset>
      </form>
    </section>
    <History history={history} legacy={legacy} practices={practices} timezone={timezone} />
  </>;
}
