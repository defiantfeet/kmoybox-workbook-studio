'use client';

import { useState } from 'react';
import Link from 'next/link';
import { saveExercise } from '../lib/becoming/actions';
import { saveBody } from '../lib/becoming/body-actions';
import { bodyPath, bodyRegions, emptyMovement, emptyObservation, sensations, type BodyEntry,
  type BodyObservation, type BodyRegion, type BodySnapshot } from '../lib/becoming/body';
import { findModule } from '../lib/becoming/catalog';
import type { bodyModule } from '../lib/becoming/data';
import { BodyOutline } from './body-outline';
import { EmotionPicker } from './emotion-picker';
import { StudioForm } from './forms';
import { GrowthFields } from './growth-fields';

const notes = { context: 'Context', activity: 'Movement or activity', reflection: 'Reflection' } as const;

function RegionFields({ item, update, offeredEmotions }: { item: BodyObservation; offeredEmotions: string[]; update: (changes: Partial<BodyObservation>) => void }) {
  const [picker, setPicker] = useState(false);
  return <fieldset className="body-region-fields">
    <legend>{item.region} observation</legend>
    <div className="boundary-grid">
      <label>Sensation type<select value={item.sensation} onChange={event => {
        const sensation = event.target.value as BodyObservation['sensation'];
        update({ sensation, custom: sensation === 'Custom' ? item.custom : '' });
      }}>
        <option value="">Leave blank</option>
        {sensations.map(value => <option key={value}>{value}</option>)}
        <option value="Custom">Custom sensation</option>
      </select></label>
      <label>Intensity (0 to 10)<select value={item.intensity ?? ''}
        onChange={event => update({ intensity: event.target.value === '' ? null : Number(event.target.value) })}>
        <option value="">Leave unrated</option>
        {Array.from({ length: 11 }, (_, value) => <option key={value}>{value}</option>)}
      </select></label>
    </div>
    {item.sensation === 'Custom' && <label>Custom sensation<input value={item.custom} maxLength={80} required
      onChange={event => update({ custom: event.target.value })} /></label>}
    <details onToggle={event => setPicker(event.currentTarget.open)}>
      <summary>Associated emotions (optional){item.emotions.length ? ' · ' + item.emotions.join(', ') : ''}</summary>
      {picker && offeredEmotions.length > 0 && !item.emotions.length && <button className="secondary" type="button"
        onClick={() => update({ emotions: offeredEmotions })}>Use emotions from my mood check-in</button>}
      {picker && <EmotionPicker value={item.emotions} onChange={emotions => update({ emotions })} />}
    </details>
    {Object.entries(notes).map(([key, label]) => {
      const field = key as keyof typeof notes;
      return <label key={field}>{label} (optional)<textarea rows={2} maxLength={2000} value={item[field]}
        onChange={event => update({ [field]: event.target.value })} /></label>;
    })}
  </fieldset>;
}

function Composer({ preview, offeredEmotions }: { preview: boolean; offeredEmotions: string[] }) {
  const [regions, setRegions] = useState<BodyRegion[]>([]);
  const [notesByRegion, setNotes] = useState<Partial<Record<BodyRegion, BodyObservation>>>({});
  const [movement, setMovement] = useState(emptyMovement);
  const [mapVisible, setMapVisible] = useState(true);
  const toggle = (region: BodyRegion) => setRegions(items => items.includes(region) ? items.filter(item => item !== region) : [...items, region]);
  const observations = mapVisible ? bodyRegions.filter(region => regions.includes(region))
    .map(region => notesByRegion[region] ?? emptyObservation(region)) : [];
  const entry: BodyEntry = { format: 'body-v1', observations, movement };
  return <section className="panel growth-panel" aria-labelledby="body-practice">
    <h2 id="body-practice">Record an observation</h2>
    <p>Choose what to notice and what to leave blank. This is a space to describe your experience in your own words.</p>
    <div className="growth-actions">
      <button className="secondary" type="button" onClick={() => setMapVisible(value => !value)}>
        {mapVisible ? 'Skip body mapping' : 'Return to body mapping'}
      </button>
      <a className="text-button" href="#body-history">Skip to observation history</a>
    </div>
    <StudioForm action={saveBody} className="stack growth-form body-form">
      <input type="hidden" name="entry" value={JSON.stringify(entry)} />
      {mapVisible && <>
        <div className="body-map-grid">
          <BodyOutline selected={regions} onChange={toggle} />
          <fieldset className="body-list">
            <legend>Select body regions from a list</legend>
            <p role="status" className="muted">{regions.length} {regions.length === 1 ? 'region' : 'regions'} selected</p>
            {bodyRegions.map(region => <label key={region}><input type="checkbox" checked={regions.includes(region)}
              onChange={() => toggle(region)} /> {region}</label>)}
          </fieldset>
        </div>
        {observations.map(item => <RegionFields key={item.region} item={item} offeredEmotions={offeredEmotions}
          update={changes => setNotes(current => ({ ...current, [item.region]: { ...item, ...changes } }))} />)}
      </>}
      <details id="movement-reflection">
        <summary>Optional movement or stillness reflection</summary>
        <p>Choose a comfortable option, adapt it, or skip it. You can stop at any time.</p>
        <ul className="growth-list">
          <li><strong>Gentle movement</strong> Try a small, familiar movement such as opening and closing one hand.</li>
          <li><strong>Seated option</strong> If you like, shift lightly against the chair or rest your hands on a surface.</li>
          <li><strong>Non-movement option</strong> Stay as you are and notice a sound, the light, or a point of contact with a surface. You can focus on the room instead of your body.</li>
        </ul>
        {([['activity', 'What did you choose to do?'], ['before', 'What did you notice before?'], ['after', 'What did you notice afterward?']] as const)
          .map(([key, label]) => <label key={key}>{label}<textarea rows={2} maxLength={2000} value={movement[key]}
            onChange={event => setMovement(current => ({ ...current, [key]: event.target.value }))} /></label>)}
      </details>
      <button className="primary" disabled={preview}>Save observation</button>
    </StudioForm>
  </section>;
}

function Snapshot({ snapshot }: { snapshot: BodySnapshot }) {
  const { observations, movement } = snapshot.entry;
  return <>
    {observations.length > 0 && <div className="body-map-grid body-history-map">
      <BodyOutline selected={observations.map(item => item.region)} />
      <div>
        <h3>Recorded regions</h3>
        <p>Highlighted areas show where you recorded an observation.</p>
        <ul className="growth-list">
          {observations.map(item => <li key={item.region}>
            <h4>{item.region}</h4>
            {item.sensation && <p>Sensation: {item.sensation === 'Custom' ? item.custom : item.sensation}</p>}
            <p>Intensity: {item.intensity === null ? 'Unrated' : item.intensity + ' / 10'}</p>
            {item.intensity !== null && <div className="body-intensity" aria-hidden>
              <span style={{ width: item.intensity * 10 + '%' }} />
            </div>}
            {item.emotions.length > 0 && <p>Emotions: {item.emotions.join(', ')}</p>}
            {Object.entries(notes).map(([key, label]) => item[key as keyof typeof notes] && <p key={key} className="growth-note">
              <strong>{label}</strong> {item[key as keyof typeof notes]}
            </p>)}
          </li>)}
        </ul>
      </div>
    </div>}
    {Object.values(movement).some(Boolean) && <div className="body-movement-summary">
      <h3>Movement or stillness reflection</h3>
      <dl className="growth-list">
        {([['activity', 'Activity'], ['before', 'Before'], ['after', 'After']] as const).map(([key, label]) => movement[key] &&
          <div key={key}><dt>{label}</dt><dd className="growth-note">{movement[key]}</dd></div>)}
      </dl>
    </div>}
  </>;
}

export function BodyAwareness({ history, selected, page, hasNext, legacy, earlier, saved, preview, timezone, offeredEmotions = [] }: Awaited<ReturnType<typeof bodyModule>> & {
  page: number; preview: boolean; saved: boolean; offeredEmotions?: string[]; timezone: string;
}) {
  const [viewed, setViewed] = useState(selected?.id ?? history[0]?.id ?? '');
  const active = [selected, ...history].find(item => item?.id === viewed);
  const available = selected && !history.some(item => item.id === selected.id) ? [selected, ...history] : history;
  const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });
  const fields = findModule('body-awareness-map')!.fields;
  return <>
    <Composer offeredEmotions={offeredEmotions} preview={preview} />
    <section className="panel growth-panel" aria-labelledby="body-history">
      <h2 id="body-history" tabIndex={-1}>Observation history</h2>
      {saved && <p role="status">Observation saved.</p>}
      {available.length > 0 ? <>
        <label className="values-label">Saved observation<select value={viewed} onChange={event => setViewed(event.target.value)}>
          {available.map(item => <option key={item.id} value={item.id}>{date.format(new Date(item.completedAt))} · {item.entry.observations.length
            ? item.entry.observations.map(observation => observation.region).join(', ') : 'Movement or stillness'}</option>)}
        </select></label>
        {active && <Snapshot key={active.id} snapshot={active} />}
      </> : <p className="muted">Saved observations will appear here.</p>}
      {legacy && <details className="body-legacy">
        <summary>Earlier Body Awareness exercise</summary>
        <GrowthFields action={saveExercise.bind(null, 'body-awareness-map')} fields={fields} answers={legacy.answers}
          revision={legacy.updated_at} exercise disabled={preview} useEmotions initialEmotions={legacy.answers?.emotions} />
      </details>}
      {earlier.map(item => <details className="body-legacy" key={item.id}>
        <summary>Earlier reflection · {date.format(new Date(item.completed_at))}</summary>
        <dl className="growth-list">{fields.map((field, index) => <div key={field.label}>
          <dt>{field.label}</dt><dd className="growth-note">{item.answers[String(index)]}</dd>
        </div>)}</dl>
        {Array.isArray(item.answers.emotions) && <p>{item.answers.emotions.join(', ')}</p>}
      </details>)}
      {(page > 1 || hasNext) && <nav className="growth-actions" aria-label="Observation history pages">
        {page > 1 && <Link href={bodyPath + '?historyPage=' + (page - 1) + '#body-history'}>Newer observations</Link>}
        {hasNext && <Link href={bodyPath + '?historyPage=' + (page + 1) + '#body-history'}>Older observations</Link>}
      </nav>}
    </section>
    <section className="panel growth-panel" aria-labelledby="body-related">
      <h2 id="body-related">Related reflections</h2>
      <p>Use a separate mood check-in or explore feeling words. Your observations stay in this journal.</p>
      <div className="growth-actions">
        <Link href="/becoming/mood-tracker">Open Mood Tracker</Link>
        <Link href="/becoming/emotional-wheel">Open Emotional Wheel</Link>
      </div>
    </section>
  </>;
}
