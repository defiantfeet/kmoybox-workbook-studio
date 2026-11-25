'use client';

import { useState } from 'react';
import Link from 'next/link';
import { saveExercise } from '../lib/becoming/actions';
import { findModule } from '../lib/becoming/catalog';
import type { timelineModule } from '../lib/becoming/data';
import { deleteTimeline, saveTimeline } from '../lib/becoming/timeline-actions';
import { emptyTimeline, timelineCategories, timelineFields, timelineImageLimit, timelinePath, timelineTones, timingLabel,
  timingLabels, type TimelineEntry, type TimelineRecord, type TimelineWhen } from '../lib/becoming/timeline';
import { EmotionPicker } from './emotion-picker';
import { StudioForm } from './forms';
import { GrowthFields } from './growth-fields';

type Props = Awaited<ReturnType<typeof timelineModule>> & {
  selected?: TimelineRecord; saved: boolean; deleted: boolean; timezone: string; preview: boolean;
};
const blankTiming: Record<TimelineWhen['mode'], TimelineWhen> = {
  exact: { mode: 'exact', date: '' }, approximate: { mode: 'approximate', year: '', month: '' },
  age: { mode: 'age', start: 0, end: 0 }, chapter: { mode: 'chapter', label: '' },
};
const months = Array.from({ length: 12 }, (_, index) => ({
  key: String(index + 1).padStart(2, '0'),
  name: new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, index, 1))),
}));

function TimingFields({ value, update }: { value: TimelineWhen; update: (value: TimelineWhen) => void }) {
  return <fieldset className="timeline-timing">
    <legend>Date or life stage</legend>
    <label>Timing type<select value={value.mode} onChange={event => update(blankTiming[event.target.value as TimelineWhen['mode']])}>
      {Object.entries(timingLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </select></label>
    {value.mode === 'exact' && <label>Event date<input type="date" value={value.date} required min="0001-01-01" max="9999-12-31"
      onChange={event => update({ ...value, date: event.target.value })} /></label>}
    {value.mode === 'approximate' && <div className="boundary-grid">
      <label>Approximate year<input inputMode="numeric" pattern="[1-9][0-9]{3}" maxLength={4} required value={value.year}
        onChange={event => update({ ...value, year: event.target.value })} /></label>
      <label>Month (optional)<select value={value.month} onChange={event => update({ ...value, month: event.target.value })}>
        <option value="">Year only</option>{months.map(month => <option key={month.key} value={month.key}>{month.name}</option>)}
      </select></label>
    </div>}
    {value.mode === 'age' && <div className="boundary-grid">
      <label>Starting age<input type="number" required min={0} max={150} value={Number.isNaN(value.start) ? '' : value.start}
        onChange={event => {
          const start = event.target.valueAsNumber;
          const end = Number.isFinite(start) && Number.isFinite(value.end) ? Math.max(value.end, start) : value.end;
          update({ ...value, start, end });
        }} /></label>
      <label>Ending age<input type="number" required min={Number.isNaN(value.start) ? 0 : value.start} max={150}
        value={Number.isNaN(value.end) ? '' : value.end}
        onChange={event => update({ ...value, end: event.target.valueAsNumber })} /></label>
    </div>}
    {value.mode === 'chapter' && <label>Life chapter or stage (optional)<input maxLength={120} value={value.label}
      onChange={event => update({ ...value, label: event.target.value })} /></label>}
  </fieldset>;
}

function TimelinePicture({ item }: { item: TimelineRecord }) {
  return <img className="timeline-picture" loading="lazy" src={timelinePath + '/image/' + item.id}
    alt={'Private image for ' + item.event.title} />;
}

function EventEditor({ selected, preview, saved, identity, future }: Pick<Props, 'selected' | 'preview' | 'saved' | 'identity' | 'future'>) {
  const [entry, setEntry] = useState<TimelineEntry>(selected?.event ?? emptyTimeline);
  const [picker, setPicker] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [remove, setRemove] = useState(false);
  const patch = (fields: Partial<TimelineEntry>) => setEntry(previous => ({ ...previous, ...fields }));
  return <section className="panel growth-panel" aria-labelledby="timeline-editor">
    <h2 id="timeline-editor" tabIndex={-1}>{selected ? 'Edit event' : 'Add a life event'}</h2>
    {saved && <p role="status">Event saved.</p>}
    {selected && <Link className="text-button" href={timelinePath + '#timeline-editor'}>Add another event</Link>}
    <p>Record only what you want to remember. Approximate dates and unnamed chapters are enough.</p>
    <StudioForm action={saveTimeline.bind(null, selected?.id ?? '', selected?.revision ?? '')} className="stack growth-form timeline-form">
      <input type="hidden" name="event" value={JSON.stringify(entry)} />
      <label>Event title<input maxLength={120} required value={entry.title} onChange={event => patch({ title: event.target.value })} /></label>
      <TimingFields value={entry.timing} update={timing => patch({ timing })} />
      <div className="boundary-grid">
        <label>Category (optional)<select value={entry.category} onChange={event => patch({ category: event.target.value as TimelineEntry['category'] })}>
          <option value="">No category</option>{timelineCategories.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>How you describe this event (optional)<select value={entry.tone} onChange={event => patch({ tone: event.target.value as TimelineEntry['tone'] })}>
          <option value="">No description</option>{timelineTones.map(value => <option key={value}>{value}</option>)}
        </select></label>
      </div>
      <label className="timeline-check"><input type="checkbox" checked={entry.future} onChange={event => patch({ future: event.target.checked })} /> Future milestone</label>
      {entry.future && <div className="timeline-source">
        <Link className="text-button" href="/becoming/future-self-visualization">Open Future-Self Visualization</Link>
        {future.length > 0 && <label>Use a saved future-self horizon date<select value="" onChange={event => {
          const option = future.find(item => item.id === event.target.value);
          if (option) patch({ timing: { mode: 'exact', date: option.target } });
        }}>
          <option value="">Choose a date</option>{future.map(item =>
            <option key={item.id} value={item.id}>{item.horizon} · {timingLabel({ mode: 'exact', date: item.target })}</option>)}
        </select></label>}
      </div>}
      <details onToggle={event => setPicker(event.currentTarget.open)}>
        <summary>Emotions (optional){entry.emotions.length > 0 ? ' · ' + entry.emotions.join(', ') : ''}</summary>
        {picker && <EmotionPicker value={entry.emotions} onChange={emotions => patch({ emotions })} />}
      </details>
      <details>
        <summary>Event notes (optional)</summary>
        <div className="future-grid">
          {Object.entries(timelineFields).map(([key, label]) => {
            const field = key as keyof typeof timelineFields;
            return <div key={field}><label>{label}<textarea maxLength={2000} rows={3} value={entry.notes[field] ?? ''}
              onChange={event => patch({ notes: { ...entry.notes, [field]: event.target.value } })} /></label>
              {field === 'identity' && <>
                <Link className="text-button" href="/becoming/identity-mapping">Open Identity Mapping</Link>
                {identity.length > 0 && <label>Add an element from your identity map<select value="" onChange={event => {
                  const label = event.target.value;
                  if (label) patch({ notes: { ...entry.notes,
                    identity: [entry.notes.identity?.trim(), label].filter(Boolean).join('\n').slice(0, 2000) } });
                }}>
                  <option value="">Choose an element</option>{identity.map(label => <option key={label}>{label}</option>)}
                </select></label>}
              </>}
            </div>;
          })}
        </div>
      </details>
      <details>
        <summary>Private image (optional)</summary>
        {selected?.image && !remove && <TimelinePicture item={selected} />}
        {selected?.image && <label className="timeline-check"><input type="checkbox" name="removeImage" value="yes" checked={remove}
          onChange={event => setRemove(event.target.checked)} /> Remove the attached image</label>}
        <label>{selected?.image ? 'Choose a replacement image' : 'Attach an image'}<input name="image" type="file"
          accept="image/png,image/jpeg,image/webp" onChange={event => {
            const file = event.target.files?.[0];
            event.target.setCustomValidity(file && file.size > timelineImageLimit ? 'Choose an image no larger than 512 KB.' : '');
            if (file) setRemove(false);
          }} /></label>
        <p className="muted">PNG, JPEG, or WebP up to 512 KB.</p>
      </details>
      <label className="timeline-check"><input type="checkbox" checked={entry.hidden} onChange={event => patch({ hidden: event.target.checked })} />
        Hide from my timeline</label>
      <button className="primary" disabled={preview}>Save event</button>
    </StudioForm>
    {selected && <details className="timeline-delete">
      <summary>Delete this event</summary>
      <StudioForm action={deleteTimeline.bind(null, selected.id, selected.revision)} className="stack growth-form">
        <p>Deleting the event also removes its image.</p>
        <label className="timeline-check"><input type="checkbox" name="confirm" value="yes" checked={deleteConfirmed}
          onChange={event => setDeleteConfirmed(event.target.checked)} /> Confirm event deletion</label>
        <button className="secondary" disabled={preview || !deleteConfirmed}>Delete event permanently</button>
      </StudioForm>
    </details>}
  </section>;
}

function EventList({ records, selected, deleted }: Pick<Props, 'records' | 'selected' | 'deleted'>) {
  const [visibility, setVisibility] = useState(selected?.event.hidden ? 'hidden' : 'visible');
  const [category, setCategory] = useState('');
  const listed = records.filter(item => item.event.hidden === (visibility === 'hidden') && (!category || item.event.category === category));
  const groups = [
    { title: 'Dated events', matches: (item: TimelineRecord) => !item.event.future && ['exact', 'approximate'].includes(item.event.timing.mode) },
    { title: 'Age ranges', matches: (item: TimelineRecord) => !item.event.future && item.event.timing.mode === 'age' },
    { title: 'Undated chapters', matches: (item: TimelineRecord) => !item.event.future && item.event.timing.mode === 'chapter' },
    { title: 'Future milestones', matches: (item: TimelineRecord) => item.event.future },
  ];
  return <section className="panel growth-panel" aria-labelledby="timeline-events">
    <h2 id="timeline-events" tabIndex={-1}>Your life timeline</h2>
    {deleted && <p role="status">Event deleted.</p>}
    <div className="boundary-grid">
      <label className="values-label">Show events<select value={visibility} onChange={event => setVisibility(event.target.value)}>
        <option value="visible">On my timeline</option><option value="hidden">Hidden events</option>
      </select></label>
      <label className="values-label">Filter by category<select value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">All categories</option>{timelineCategories.map(value => <option key={value}>{value}</option>)}
      </select></label>
    </div>
    {listed.length === 0 && <p className="muted">No events match this view.</p>}
    {groups.map(group => {
      const matches = listed.filter(group.matches);
      return matches.length > 0 && <div className="timeline-lane" key={group.title}>
        <h3>{group.title}</h3>
        <ol>{matches.map(item => <li key={item.id} className={item.event.future ? 'timeline-future' : undefined}>
          <details>
            <summary><strong>{item.event.title}</strong> <span>{timingLabel(item.event.timing)}</span></summary>
            <div className="timeline-event-details">
              {item.event.future && <p><strong>Future milestone</strong></p>}
              {item.event.category && <p>Category: {item.event.category}</p>}
              {item.event.tone && <p>You described this as {item.event.tone.toLowerCase()}.</p>}
              {item.event.emotions.length > 0 && <p>Emotions: {item.event.emotions.join(', ')}</p>}
              {Object.entries(timelineFields).map(([key, label]) => {
                const note = item.event.notes[key as keyof typeof timelineFields];
                return note && <p className="growth-note" key={key}><strong>{label}</strong><br />{note}</p>;
              })}
              {item.image && <TimelinePicture item={item} />}
              <Link className="text-button" href={timelinePath + '?event=' + item.id + '#timeline-editor'}
                aria-label={'Edit ' + item.event.title}>Edit event</Link>
              {item.event.future && !item.event.hidden && item.event.timing.mode === 'exact' && <Link className="text-button"
                href={'/becoming/future-self-visualization?milestone=' + item.id + '#future-editor'}>Explore this milestone in Future-Self Visualization</Link>}
            </div>
          </details>
        </li>)}</ol>
      </div>;
    })}
    <a className="text-button" href="/personal-data" download>Export private activity, including timeline events and images</a>
  </section>;
}

export function LifeTimeline({ records, selected, legacy, earlier, timezone, preview, saved, deleted, identity, future }: Props) {
  const fields = findModule('life-timeline')!.fields;
  const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: timezone });
  return <>
    <EventList records={records} selected={selected} deleted={deleted} />
    <EventEditor selected={selected} preview={preview} saved={saved} identity={identity} future={future} />
    {(legacy || earlier.length > 0) && <section className="panel growth-panel" aria-labelledby="timeline-earlier">
      <h2 id="timeline-earlier">Earlier timeline reflections</h2>
      {legacy && <details><summary>Open earlier guided reflection</summary>
        <GrowthFields action={saveExercise.bind(null, 'life-timeline')} fields={fields} answers={legacy.answers}
          revision={legacy.updated_at} exercise disabled={preview} />
      </details>}
      {earlier.map(item => <details key={item.id}><summary>{date.format(new Date(item.completed_at))}</summary>
        <dl className="growth-list">{fields.map((field, index) => <div key={field.label}>
          <dt>{field.label}</dt><dd className="growth-note">{item.answers[String(index)]}</dd>
        </div>)}</dl>
      </details>)}
    </section>}
    <nav className="panel growth-panel" aria-label="Related timeline reflections">
      <div className="growth-actions">
        <Link href="/becoming/identity-mapping">Open Identity Mapping</Link>
        <Link href="/becoming/future-self-visualization">Open Future-Self Visualization</Link>
      </div>
    </nav>
  </>;
}
