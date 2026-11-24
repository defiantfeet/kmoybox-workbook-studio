'use client';

import { useGrowthContent } from './growth-content-context';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { ActionState } from '../lib/actions';
import { addBoundaryPractice, importBoundaryRelationship, saveBoundary } from '../lib/becoming/boundary-actions';
import { boundaryCategories, boundaryFields, boundaryTemplates, boundaryZones, privatePlanning,
  type BoundaryEntry, type BoundaryField, type BoundaryJournal, type BoundaryRecord, type RelationshipOption } from '../lib/becoming/boundaries';
import { StudioForm } from './forms';

const path = '/becoming/boundary-builder';
type Props = {
  record: BoundaryRecord;
  boundaries: { id: string; label: string; category: string; zone: string; followUpDate: string }[];
  relationships: RelationshipOption[]; values: string[]; journal: BoundaryJournal[];
  timezone: string; today: string; preview: boolean; saved: boolean;
};

function RelationshipLink({ relationships, timezone, preview, onImport }: Pick<Props, 'relationships' | 'timezone' | 'preview'>
  & { onImport: (source: { id: string; context: string }) => void }) {
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [status, dispatch, pending] = useActionState(async (previous: ActionState, data: FormData) => {
    const { source, ...result } = await importBoundaryRelationship(previous, data);
    if (source) { onImport(source); setConfirmed(false); }
    return result;
  }, { message: '' });
  const date = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' });
  return <details className="values-section">
    <summary>Link a Relationship Inventory entry</summary>
    <p>You can link an entry and copy its boundary reflection or label into an empty situation field.</p>
    {relationships.length > 0 ? <form action={dispatch}>
      <fieldset className="thought-form" disabled={pending}>
        <label className="values-label">Relationship Inventory entry<select name="relationshipId" value={selected} onChange={event => {
          setSelected(event.target.value);
          setConfirmed(false);
        }}>
          <option value="">Choose an entry</option>
          {relationships.map(({ id, savedAt, draft, label }, index) => <option key={id} value={id}>
            {label || (draft ? 'Draft' : 'Entry ' + (relationships.length - index))} · {date.format(new Date(savedAt))}
          </option>)}
        </select></label>
        <label className="reframe-confirm"><input type="checkbox" name="confirm" value="yes" disabled={!selected}
          checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I want to link the selected entry.</label>
        <button className="secondary" disabled={preview || !selected || !confirmed}>Link relationship context</button>
        {status.message && <p className={status.error ? 'error' : 'growth-status'} role={status.error ? 'alert' : 'status'}>{status.message}</p>}
      </fieldset>
    </form> : <p className="muted">Save a Relationship Inventory entry to link it here.</p>}
    <Link className="text-button" href="/becoming/relationship-inventory">Open Relationship Inventory</Link>
  </details>;
}

function PracticeJournal({ record, today, preview, journal }: Pick<Props, 'record' | 'today' | 'preview' | 'journal'>) {
  return <section className="panel growth-panel" aria-labelledby="boundary-practice">
    <h2 id="boundary-practice">Boundary practice journal</h2>
    {!record.savedAt ? <p className="muted">Save this boundary to add dated practice notes or reflections.</p> : <>
      <p>Use this journal to reflect privately on a boundary or a step you took. Reflection on its own is welcome.</p>
      <StudioForm action={addBoundaryPractice.bind(null, record.id)} className="stack thought-form">
        <label className="values-label">Practice date<input type="date" name="date" max={today} defaultValue={today} required /></label>
        <label className="values-label">{privatePlanning(record.entry) ? 'What did you notice or do privately?' : 'What did you notice, rehearse, or try?'}<textarea name="practice" rows={2} maxLength={2000} /></label>
        <label className="values-label">What did you notice afterward?<textarea name="reflection" rows={2} maxLength={2000} /></label>
        <button className="primary" disabled={preview}>Save practice note</button>
      </StudioForm>
      {journal.length > 0 && <ol className="growth-list thought-history">{journal.map(item => <li key={item.id}>
        <details><summary><time dateTime={item.occurred_on}>{item.occurred_on}</time></summary>
          {item.practice && <p className="growth-note">{item.practice}</p>}
          {item.reflection && <p className="growth-note"><strong>Reflection</strong><br />{item.reflection}</p>}
        </details>
      </li>)}</ol>}
    </>}
  </section>;
}

export function BoundaryBuilder({ record, boundaries, relationships, values, journal, timezone, today, preview, saved }: Props) {
  const managed = useGrowthContent('boundary');
  const templates = [...boundaryTemplates.map(body => ({ id: body, title: body, body })),
    ...managed.map(item => ({ id: item.item_id, title: item.title, body: item.body }))];
  const [entry, setEntry] = useState(record.entry);
  const [status, dispatch, pending] = useActionState(saveBoundary, { message: '' } as ActionState);
  const privateOnly = privatePlanning(entry);
  const set = (value: Partial<BoundaryEntry>) => setEntry(old => ({ ...old, ...value }));
  const write = (key: BoundaryField, value: string) => setEntry(old => ({ ...old, notes: { ...old.notes, [key]: value } }));
  const note = (key: BoundaryField) => <label className="values-label">{boundaryFields[key]}
    <textarea rows={2} maxLength={2000} value={entry.notes[key] ?? ''} onChange={event => write(key, event.target.value)} />
  </label>;
  const groups = [...boundaryZones, ''] as const;
  return <>
    <section className="panel growth-panel" aria-labelledby="boundary-editor">
      <h2 id="boundary-editor">{record.savedAt ? 'Edit saved boundary' : 'Plan a boundary'}</h2>
      <p>Use this space to work out what feels comfortable, where you want flexibility, and what you need to protect.</p>
      {saved && <p role="status" className="growth-status">Boundary saved.</p>}
      <RelationshipLink relationships={relationships} timezone={timezone} preview={preview} onImport={source => setEntry(old => ({
        ...old, relationshipId: source.id, notes: { ...old.notes, situation: old.notes.situation?.trim() ? old.notes.situation : source.context },
      }))} />
      {entry.relationshipId && <p className="growth-status">Relationship Inventory entry linked. <button type="button" className="text-button"
        onClick={() => set({ relationshipId: '' })}>Remove link</button></p>}
      <form action={dispatch}>
        <fieldset className="thought-form" disabled={pending}>
          <input type="hidden" name="id" value={record.id} />
          <input type="hidden" name="revision" value={record.revision} />
          <input type="hidden" name="boundary" value={JSON.stringify(entry)} />
          <div className="boundary-grid">
            <label className="values-label">Category (optional)<select value={entry.category} onChange={event => set({ category: event.target.value as BoundaryEntry['category'] })}>
              <option value="">Choose a category</option>{boundaryCategories.map(item => <option key={item}>{item}</option>)}
            </select></label>
            <label className="values-label">Boundary group<select value={entry.zone} onChange={event => set({ zone: event.target.value as BoundaryEntry['zone'] })}>
              <option value="">Choose a group</option>{boundaryZones.map(item => <option key={item}>{item}</option>)}
            </select></label>
          </div>
          {note('situation')}{note('need')}
          {values.length > 0 && <label className="values-label">Choose a value from your assessment<select value="" onChange={event => write('value', event.target.value)}>
            <option value="">Choose a core value</option>{values.map(item => <option key={item}>{item}</option>)}
          </select></label>}
          {note('value')}
          <Link className="text-button" href="/becoming/values-assessment">Open Values Assessment</Link>
          {note('current')}{note('desired')}
          <label className="values-label">Does it feel safe to communicate directly? (optional)
            <select value={entry.safety} onChange={event => set({ safety: event.target.value as BoundaryEntry['safety'] })}>
              <option value="">Prefer to leave this blank</option>
              <option value="safe">Yes, it feels safe</option><option value="uncertain">I’m unsure</option><option value="unsafe">No, it may be unsafe</option>
            </select>
          </label>
          {privateOnly && <div className="boundary-safety" role="status">
            <strong>Give yourself room to plan privately.</strong>
            <p>You can leave communication blank. Consider a lower-risk next step you control, such as taking time or seeking support from someone you trust if that feels safe.</p>
          </div>}
          {note('preference')}{note('action')}{note('obstacles')}
          {!privateOnly && <fieldset className="thought-form boundary-templates">
            <legend>Editable communication templates</legend>
            <p>Use any starter that fits your plan. Choose a response within your control and edit it in your own words.</p>
            <div className="growth-actions">{templates.map(template => <button type="button" className="secondary" key={template.id}
              disabled={entry.script.length + template.body.length + 3 > 2000}
              onClick={() => set({ script: entry.script ? entry.script + '\n' + template.body : template.body })}>{template.title}</button>)}</div>
            <label className="values-label">Private script<textarea rows={4} maxLength={2000} value={entry.script} onChange={event => set({ script: event.target.value })} /></label>
          </fieldset>}
          {note('followUp')}
          <label className="values-label">Follow-up reminder date (optional)<input type="date" value={entry.followUpDate} onChange={event => set({ followUpDate: event.target.value })} /></label>
          <p className="muted">Reminders appear in the Studio after you save the boundary. They’re for checking in with yourself.</p>
          {entry.followUpDate && <button type="button" className="text-button" onClick={() => set({ followUpDate: '' })}>Clear reminder date</button>}
          <div className="growth-actions">
            {!record.savedAt && <button className="secondary" name="intent" value="draft" disabled={preview}>Save draft</button>}
            <button className="primary" name="intent" value="save" disabled={preview}>Save boundary</button>
            {record.savedAt && <Link className="text-button" href={path}>Return to draft or start a boundary</Link>}
          </div>
          {status.message && <p className={status.error ? 'error' : 'growth-status'} role={status.error ? 'alert' : 'status'}>{status.message}</p>}
        </fieldset>
      </form>
    </section>
    <PracticeJournal record={record} today={today} preview={preview} journal={journal} />
    <section className="panel growth-panel" aria-labelledby="boundary-library">
      <h2 id="boundary-library">Your saved boundaries</h2>
      {!boundaries.length && <p className="muted">Saved boundaries and follow-up reminders will appear here.</p>}
      <div className="boundary-grid">{groups.map(group => {
        const items = boundaries.filter(item => item.zone === group);
        return items.length > 0 && <section className="boundary-group" key={group}>
          <h3>{group || 'Earlier ungrouped boundaries'}</h3>
          <ul className="growth-list">{items.map(item => <li key={item.id}>
            <Link className="text-button" href={path + '?boundaryId=' + item.id + '#boundary-editor'}>{item.label}</Link>
            {item.category && <p className="muted">{item.category}</p>}
            {item.followUpDate && <p className={item.followUpDate <= today ? 'growth-status' : 'muted'}>
              {item.followUpDate <= today ? 'Follow-up due' : 'Follow-up'} · <time dateTime={item.followUpDate}>{item.followUpDate}</time>
            </p>}
          </li>)}</ul>
        </section>;
      })}</div>
    </section>
  </>;
}
