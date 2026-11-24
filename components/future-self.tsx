'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createHabit, saveExercise } from '../lib/becoming/actions';
import { findModule } from '../lib/becoming/catalog';
import type { futureModule } from '../lib/becoming/data';
import { createFutureGoal, saveFuture } from '../lib/becoming/future-actions';
import { emptyFuture, futurePath, futurePrompts, futureSections, horizonDate, horizons,
  type FutureFields, type FutureSnapshot, type Horizon } from '../lib/becoming/future';
import { StudioForm } from './forms';
import { GrowthFields } from './growth-fields';

function formattedDay(day: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z'));
}

function VisionBoard({ cards, update }: { cards: string[]; update: (cards: string[]) => void }) {
  return <details className="future-details">
    <summary>Private vision board (optional)</summary>
    <p>Collect words, phrases, or short descriptions of scenes you want to remember.</p>
    <div className="future-board">
      {cards.map((card, index) => <div className="future-card" key={index}>
        <label>Vision board card {index + 1}<textarea maxLength={300} rows={3} value={card}
          onChange={event => update(cards.map((value, position) => position === index ? event.target.value : value))} /></label>
        <button className="text-button" type="button" aria-label={'Remove vision board card ' + (index + 1)}
          onClick={() => update(cards.filter((_, position) => position !== index))}>Remove card</button>
      </div>)}
    </div>
    {cards.length < 8 && <button className="secondary" type="button" onClick={() => update([...cards, ''])}>Add a vision board card</button>}
  </details>;
}

function FutureEditor({ selected, today, values, preview, saved, milestoneDate }: {
  selected: FutureSnapshot | null; today: string; values: string[]; preview: boolean; saved: boolean; milestoneDate?: string;
}) {
  const [entry, setEntry] = useState<FutureFields>(selected?.entry ?? emptyFuture);
  const origin = selected?.entry.origin ?? today;
  const target = horizonDate(origin, entry.horizon, entry.customDate);
  const patch = (fields: Partial<FutureFields>) => setEntry(previous => ({ ...previous, ...fields }));
  const save = saveFuture.bind(null, selected?.id ?? '', selected?.revision ?? '');
  return <section className="panel growth-panel" aria-labelledby="future-editor">
    <h2 id="future-editor" tabIndex={-1}>{selected ? 'Edit your future-self entry' : 'Imagine a possible future'}</h2>
    {saved && <p role="status">Reflection saved.</p>}
    {selected && <Link className="text-button" href={futurePath + '#future-editor'}>Start a new reflection</Link>}
    <p>Use this exercise to explore what matters to you and what’s within reach. Real circumstances can change, and you can revise your plans.</p>
    <StudioForm action={save} className="stack growth-form future-form">
      <input type="hidden" name="entry" value={JSON.stringify(entry)} />
      {milestoneDate && <button type="button" className="secondary" onClick={() => patch({ horizon: 'Custom date', customDate: milestoneDate })}>
        Use the timeline milestone date · {formattedDay(milestoneDate)}
      </button>}
      <div className="boundary-grid">
        <label>Reflection horizon<select value={entry.horizon} onChange={event => {
          const horizon = event.target.value as Horizon;
          patch({ horizon, customDate: horizon === 'Custom date' ? entry.customDate : '' });
        }}>{horizons.map(horizon => <option key={horizon}>{horizon}</option>)}</select></label>
        {entry.horizon === 'Custom date' && <label>Custom horizon date<input type="date" required value={entry.customDate} min={origin}
          onChange={event => patch({ customDate: event.target.value })} /></label>}
      </div>
      {target && /^\d{4}-\d{2}-\d{2}$/.test(target) && <p className="muted" role="status">Imagined date: {formattedDay(target)}</p>}
      <details className="future-details" open>
        <summary>Reflection prompts</summary>
        <div className="future-grid">
          {Object.entries(futurePrompts).map(([key, label]) => {
            const field = key as keyof typeof futurePrompts;
            return <div key={field}>
              <label>{label}<textarea maxLength={2000} rows={3} value={entry.prompts[field] ?? ''}
                onChange={event => patch({ prompts: { ...entry.prompts, [field]: event.target.value } })} /></label>
              {field === 'values' && <>
                <Link className="text-button" href="/becoming/values-assessment">Open Values Assessment</Link>
                {values.length > 0 && <div className="growth-actions" role="group" aria-label="Add a core value from your assessment">
                  {values.map(value => <button key={value} className="secondary" type="button" onClick={() => {
                    const existing = entry.prompts.values?.trim() ?? '';
                    patch({ prompts: { ...entry.prompts, values: [existing, value].filter(Boolean).join('\n').slice(0, 2000) } });
                  }}>Add {value}</button>)}
                </div>}
              </>}
            </div>;
          })}
        </div>
      </details>
      <details className="future-details">
        <summary>Explore life areas</summary>
        <div className="future-grid">
          {Object.entries(futureSections).map(([key, label]) => {
            const field = key as keyof typeof futureSections;
            return <label key={field}>{label}<textarea maxLength={2000} rows={3} value={entry.sections[field] ?? ''}
              onChange={event => patch({ sections: { ...entry.sections, [field]: event.target.value } })} /></label>;
          })}
        </div>
      </details>
      <VisionBoard cards={entry.board} update={board => patch({ board })} />
      <details className="future-details">
        <summary>Letter to my future self (optional)</summary>
        <label>My letter<textarea maxLength={8000} rows={7} value={entry.letter} onChange={event => patch({ letter: event.target.value })} /></label>
      </details>
      <label>Scheduled reflection date (optional)<input type="date" value={entry.reflectionDate}
        min={entry.reflectionDate === selected?.entry.reflectionDate && entry.reflectionDate < today ? origin : today}
        onChange={event => patch({ reflectionDate: event.target.value })} /></label>
      <p className="muted">The Studio dashboard will remind you when this date arrives.</p>
      {entry.reflectionDate && <button className="text-button" type="button" onClick={() => patch({ reflectionDate: '' })}>Clear scheduled date</button>}
      <button className="primary" disabled={preview}>Save reflection</button>
    </StudioForm>
  </section>;
}

function FuturePlan({ selected, preview }: { selected: FutureSnapshot | null; preview: boolean }) {
  const [goal, setGoal] = useState('');
  const [day, setDay] = useState('');
  const [milestones, setMilestones] = useState<string[]>(['']);
  const [habit, setHabit] = useState('');
  const action = selected?.entry.prompts.action;
  const habitIdea = selected?.entry.prompts.habits;
  return <section className="panel growth-panel" aria-labelledby="future-plan">
    <h2 id="future-plan">Plan a next step</h2>
    <p>Choose an action or habit you can revisit as your circumstances change.</p>
    <StudioForm action={async (state, form) => {
      const result = await createFutureGoal(state, form);
      if (!result.error) { setGoal(''); setDay(''); setMilestones(['']); }
      return result;
    }} className="stack growth-form">
      <label>Growth goal<input name="title" maxLength={140} value={goal} required onChange={event => setGoal(event.target.value)} /></label>
      {action && !goal && <button className="secondary" type="button" onClick={() => setGoal(action.slice(0, 140))}>Use my realistic action</button>}
      <label>Goal target date (optional)<input type="date" name="target" value={day} onChange={event => setDay(event.target.value)} /></label>
      <div className="future-grid">
        {milestones.map((milestone, index) => <label key={index}>Milestone {index + 1} (optional)
          <input name="milestone" value={milestone} maxLength={140} onChange={event =>
            setMilestones(current => current.map((value, position) => position === index ? event.target.value : value))} />
        </label>)}
      </div>
      {milestones.length < 5 && <button className="secondary" type="button" onClick={() => setMilestones(items => [...items, ''])}>Add a milestone</button>}
      <button className="primary" disabled={preview}>Create growth goal</button>
      <Link className="text-button" href="/goals">Open Goals and milestones</Link>
    </StudioForm>
    <StudioForm action={async (state, form) => {
      const result = await createHabit(state, form);
      if (!result.error) setHabit('');
      return result;
    }} className="stack growth-form">
      <input type="hidden" name="source" value="future" />
      <label>Habit to practice<input name="title" maxLength={80} value={habit} required onChange={event => setHabit(event.target.value)} /></label>
      {habitIdea && !habit && <button className="secondary" type="button" onClick={() => setHabit(habitIdea.slice(0, 80))}>Use my habit idea</button>}
      <button className="primary" disabled={preview}>Add to Habit Tracker</button>
      <Link className="text-button" href="/becoming/habit-tracker?source=future">Open Habit Tracker</Link>
    </StudioForm>
  </section>;
}

function History({ entries, selected, page, hasNext, timezone }: {
  entries: FutureSnapshot[]; selected: FutureSnapshot | null; page: number; hasNext: boolean; timezone: string;
}) {
  const items = selected && !entries.some(item => item.id === selected.id) ? [selected, ...entries] : entries;
  const [leftId, setLeft] = useState(selected?.id ?? items[0]?.id ?? '');
  const [rightId, setRight] = useState(items.find(item => item.id !== leftId)?.id ?? '');
  const left = items.find(item => item.id === leftId);
  const right = items.find(item => item.id === rightId);
  const timestamp = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });
  const title = (item: FutureSnapshot) => timestamp.format(new Date(item.completedAt)) + ' · ' + item.entry.horizon;
  const pageHref = (index: number) => futurePath + '?historyPage=' + index + (selected ? '&entry=' + selected.id : '') + '#future-history';
  const editHref = (item: FutureSnapshot) => futurePath + '?entry=' + item.id + (page > 1 ? '&historyPage=' + page : '') + '#future-editor';
  const rows = items.length > 0 && left ? [
    { label: 'Imagined date', read: (item: FutureSnapshot) => formattedDay(item.entry.target) },
    { label: 'Scheduled reflection date', read: (item: FutureSnapshot) => item.entry.reflectionDate ? formattedDay(item.entry.reflectionDate) : '' },
    ...Object.entries(futurePrompts).map(([key, label]) => ({ label, read: (item: FutureSnapshot) => item.entry.prompts[key as keyof typeof futurePrompts] ?? '' })),
    ...Object.entries(futureSections).map(([key, label]) => ({ label, read: (item: FutureSnapshot) => item.entry.sections[key as keyof typeof futureSections] ?? '' })),
    { label: 'Letter to my future self', read: (item: FutureSnapshot) => item.entry.letter },
    { label: 'Vision board cards', read: (item: FutureSnapshot) => item.entry.board.join('\n') },
  ].filter(row => row.read(left) || (right && row.read(right))) : [];
  return <section className="panel growth-panel" aria-labelledby="future-history">
    <h2 id="future-history" tabIndex={-1}>Compare future-self entries</h2>
    {left ? <>
      <div className="future-grid">
        <label className="values-label">Entry to review<select value={leftId} onChange={event => {
          if (event.target.value === rightId) setRight('');
          setLeft(event.target.value);
        }}>{items.map(item => <option key={item.id} value={item.id}>{title(item)}</option>)}</select></label>
        {items.length > 1 && <label className="values-label">Compare with<select value={rightId} onChange={event => setRight(event.target.value)}>
          <option value="">Review one entry</option>{items.filter(item => item.id !== leftId).map(item =>
            <option key={item.id} value={item.id}>{title(item)}</option>)}
        </select></label>}
      </div>
      <div className="growth-actions">
        <Link className="text-button" href={editHref(left)}>Edit entry being reviewed</Link>
        {right && <Link className="text-button" href={editHref(right)}>Edit comparison entry</Link>}
      </div>
      <dl className="growth-list future-comparison">
        {rows.map(row => <div key={row.label}><dt><strong>{row.label}</strong></dt>
          <dd className="future-grid">
            <div className="growth-note">{right && <strong className="future-date">{title(left)}</strong>}{row.read(left) || 'Left blank'}</div>
            {right && <div className="growth-note"><strong className="future-date">{title(right)}</strong>{row.read(right) || 'Left blank'}</div>}
          </dd>
        </div>)}
      </dl>
    </> : <p className="muted">Save a reflection to revisit it here. When you have two entries, you can compare them side by side.</p>}
    {(page > 1 || hasNext) && <nav className="growth-actions" aria-label="Future-self history pages">
      {page > 1 && <Link href={pageHref(page - 1)}>Newer entries</Link>}
      {hasNext && <Link href={pageHref(page + 1)}>Older entries</Link>}
    </nav>}
  </section>;
}

export function FutureSelf({ history, selected, values, legacy, earlier, hasNext, page, today, timezone, preview, saved, milestoneDate }: Awaited<ReturnType<typeof futureModule>> & {
  page: number; today: string; timezone: string; preview: boolean; saved: boolean; milestoneDate?: string;
}) {
  const fields = findModule('future-self-visualization')!.fields;
  const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: timezone });
  return <>
    <FutureEditor milestoneDate={milestoneDate} selected={selected} today={today} values={values} preview={preview} saved={saved} />
    <FuturePlan selected={selected} preview={preview} />
    <History entries={history} selected={selected} page={page} hasNext={hasNext} timezone={timezone} />
    {(legacy || earlier.length > 0) && <section className="panel growth-panel" aria-labelledby="earlier-future">
      <h2 id="earlier-future">Earlier guided reflections</h2>
      {legacy && <details className="future-details"><summary>Open earlier guided reflection</summary>
        <GrowthFields action={saveExercise.bind(null, 'future-self-visualization')} fields={fields}
          answers={legacy.answers} revision={legacy.updated_at} exercise disabled={preview} />
      </details>}
      {earlier.map(item => <details className="future-details" key={item.id}>
        <summary>{date.format(new Date(item.completed_at))}</summary>
        <dl className="growth-list">{fields.map((field, index) => <div key={field.label}>
          <dt>{field.label}</dt><dd className="growth-note">{item.answers[String(index)]}</dd>
        </div>)}</dl>
      </details>)}
    </section>}
  </>;
}
