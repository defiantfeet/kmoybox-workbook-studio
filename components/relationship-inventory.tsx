'use client';

import { useState } from 'react';
import Link from 'next/link';
import { saveRelationship } from '../lib/becoming/relationship-actions';
import { closenessRings, emptyRelationship, relationshipCategories, relationshipPrompts, relationshipRatings,
  type RelationshipDetails } from '../lib/becoming/relationships';
import type { relationshipModule } from '../lib/becoming/data';
import { EmotionPicker } from './emotion-picker';
import { StudioForm } from './forms';

const path = '/becoming/relationship-inventory';
type Props = Awaited<ReturnType<typeof relationshipModule>> & { timezone: string; preview: boolean; saved?: string };

function SocialCircle({ entries, selected }: { entries: Props['entries']; selected?: string }) {
  const [showRings, setShowRings] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const groups = [...closenessRings, ''];
  const listed = filter === null ? entries : entries.filter(item => item.ring === filter);
  const toggle = (ring: string | null) => setFilter(current => current === ring ? null : ring);
  return <section className="panel growth-panel" aria-labelledby="social-circle">
    <h2 id="social-circle">Your social circle</h2>
    <p>Place each connection where it feels right to you, or leave it unplaced. Select a ring to browse those connections.</p>
    {entries.length > 0 && <>
      <label className="reframe-confirm"><input type="checkbox" checked={showRings} onChange={event => {
        setShowRings(event.target.checked);
        if (!event.target.checked) setFilter(null);
      }} /> Show closeness rings</label>
      {showRings && <div className="relationship-circle-layout">
        <svg className="relationship-circle" viewBox="0 0 320 320" role="group" aria-label="Closeness rings">
          {[...closenessRings].reverse().map((ring, index) => {
            const radius = 155 - index * 44;
            const count = entries.filter(item => item.ring === ring).length;
            return <g key={ring} role="button" tabIndex={0} aria-label={ring + ', ' + count + (count === 1 ? ' connection' : ' connections')}
              aria-pressed={filter === ring} onClick={() => toggle(ring)} onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle(ring);
                }
              }}>
              <circle cx="160" cy="160" r={radius} className={'relationship-ring ring-' + index} />
              {Array.from({ length: Math.min(count, 32) }, (_, index) => {
                const angle = (index + 1) * (2 * Math.PI - .9) / (Math.min(count, 32) + 1) + .45;
                return <circle key={index} className="relationship-marker" r="3.5"
                  cx={160 + Math.sin(angle) * (radius - 22)} cy={160 - Math.cos(angle) * (radius - 22)} aria-hidden />;
              })}
              <text x="160" y={174 - radius} textAnchor="middle" aria-hidden>{ring} · {count}</text>
            </g>;
          })}
          <circle className="relationship-center" cx="160" cy="160" r="33" />
          <text x="160" y="165" textAnchor="middle" className="relationship-center-label" aria-hidden>You</text>
        </svg>
        <div className="growth-actions" aria-label="Filter relationships by closeness">
          <button type="button" className="secondary" aria-pressed={filter === null} onClick={() => setFilter(null)}>All connections</button>
          {groups.map(ring => <button key={ring} type="button" className="secondary" aria-pressed={filter === ring}
            onClick={() => toggle(ring)}>{ring || 'Unplaced'}</button>)}
        </div>
      </div>}
      <p role="status" className="growth-status">{listed.length} {listed.length === 1 ? 'connection' : 'connections'}{filter === null ? '' : ' · ' + (filter || 'Unplaced')}</p>
      {listed.length > 0 && <ul className="growth-list relationship-list">
        {listed.map(item => <li key={item.id}>
          <Link href={path + '?relationshipId=' + item.id + '#relationship-editor'} aria-current={selected === item.id ? 'true' : undefined}>{item.label}</Link>
          <span className="muted">{item.ring || 'Unplaced'}</span>
        </li>)}
      </ul>}
    </>}
    {entries.length === 0 && <p className="growth-status">Your circle is empty. Add one connection below to get started.</p>}
    {selected && <Link className="text-button" href={path + '#relationship-editor'}>Add another relationship</Link>}
  </section>;
}

export function RelationshipInventory({ entries, record, legacy, timezone, preview, saved }: Props) {
  const [entry, setEntry] = useState<RelationshipDetails>(record?.entry ?? emptyRelationship);
  const [review, setReview] = useState('');
  const change = (fields: Partial<RelationshipDetails>) => setEntry(current => ({ ...current, ...fields }));
  const save = saveRelationship.bind(null, record?.id ?? '', record?.revision ?? '');
  const date = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium' });
  const reviewDate = new Intl.DateTimeFormat('en', { timeZone: 'UTC', dateStyle: 'medium' });

  return <>
    <SocialCircle entries={entries} selected={record?.id} />
    <section className="panel growth-panel" aria-labelledby="relationship-editor">
      <h2 id="relationship-editor">{record ? 'Edit relationship' : 'Add a relationship'}</h2>
      {saved === 'details' && record && <p role="status">Relationship saved.</p>}
      {saved === 'review' && record && <p role="status">Intention review saved.</p>}
      {record && <Link className="text-button" href={'/becoming/social-integration?section=journal&relationship=' + record.id + '#social-section'}>
        Reflect on an interaction in Social Integration
      </Link>}
      <StudioForm action={save} className="stack growth-form relationship-form">
        <input type="hidden" name="intent" value="details" />
        <input type="hidden" name="relationship" value={JSON.stringify(entry)} />
        <label>Relationship label<input value={entry.label} required maxLength={80} onChange={event => change({ label: event.target.value })}
          aria-describedby="relationship-label-hint" autoComplete="off" /></label>
        <p id="relationship-label-hint" className="muted">Use a name, initials, or an anonymous label.</p>
        <div className="boundary-grid">
          <label>Category (optional)<select value={entry.category} onChange={event => change({ category: event.target.value as RelationshipDetails['category'] })}>
            <option value="">No category</option>{relationshipCategories.map(category => <option key={category}>{category}</option>)}
          </select></label>
          <label>Closeness (optional)<select value={entry.ring} onChange={event => change({ ring: event.target.value as RelationshipDetails['ring'] })}>
            <option value="">Leave unplaced</option>{closenessRings.map(ring => <option key={ring}>{ring}</option>)}
          </select></label>
        </div>
        <details>
          <summary>Subjective ratings (optional)</summary>
          <p>Choose from 1 (very little) to 5 (very much), based on how this relationship feels to you. Skip any rating.</p>
          <div className="relationship-ratings">
            {relationshipRatings.map(rating => <label key={rating}>{rating}
              <select value={entry.ratings[rating] ?? ''} onChange={event => {
                const ratings = { ...entry.ratings };
                if (event.target.value) ratings[rating] = Number(event.target.value);
                else delete ratings[rating];
                change({ ratings });
              }}>
                <option value="">Unrated</option>{[1, 2, 3, 4, 5].map(score => <option key={score}>{score}</option>)}
              </select>
            </label>)}
          </div>
        </details>
        <details>
          <summary>Reflection questions (optional)</summary>
          {Object.entries(relationshipPrompts).map(([key, prompt]) => {
            const field = key as keyof typeof relationshipPrompts;
            return <label key={field}>{prompt}<textarea rows={2} maxLength={2000} value={entry.reflections[field] ?? ''}
              onChange={event => change({ reflections: { ...entry.reflections, [field]: event.target.value } })} /></label>;
          })}
          <details><summary>Use the Emotional Wheel</summary><EmotionPicker value={entry.emotions} onChange={emotions => change({ emotions })} /></details>
        </details>
        <label>Relationship intention (optional)<textarea rows={3} maxLength={2000} value={entry.intention}
          onChange={event => change({ intention: event.target.value })} /></label>
        <button className="primary" disabled={preview}>Save relationship</button>
      </StudioForm>
    </section>
    {record && <section className="panel growth-panel" aria-labelledby="intention-review">
      <h2 id="intention-review">Intention reviews</h2>
      {record.entry.intention ? <>
        <p className="growth-note"><strong>Current intention</strong><br />{record.entry.intention}</p>
        <StudioForm action={save} className="stack growth-form">
          <input type="hidden" name="intent" value="review" />
          <label>What have you noticed since setting this intention?<textarea name="review" value={review} onChange={event => setReview(event.target.value)}
            required maxLength={2000} rows={3} /></label>
          <button className="primary" disabled={preview}>Save intention review</button>
        </StudioForm>
      </> : <p>Save a relationship intention to start tracking how it feels over time.</p>}
      {record.entry.reviews.length > 0 ? <ol className="growth-list thought-history">
        {[...record.entry.reviews].reverse().map((item, index) => <li key={record.entry.reviews.length - index}>
          <time dateTime={item.date}>{reviewDate.format(new Date(item.date + 'T00:00:00Z'))}</time>
          <p className="growth-note"><strong>Intention</strong> {item.intention}</p>
          <p className="growth-note">{item.note}</p>
        </li>)}
      </ol> : <p className="growth-status">Your dated reviews will appear here.</p>}
    </section>}
    {legacy.length > 0 && <section className="panel growth-panel" aria-labelledby="previous-relationship-reflections">
      <h2 id="previous-relationship-reflections">Earlier relationship reflections</h2>
      {legacy.map(item => <details key={item.id}>
        <summary>{date.format(new Date(item.date))}</summary>
        <dl className="growth-list">
          {['Which connections feel supportive?', 'Where do you want more space or reciprocity?', 'What is one step you can take?']
            .map((prompt, index) => item.notes[index] && <div key={prompt}><dt>{prompt}</dt><dd className="growth-note">{item.notes[index]}</dd></div>)}
        </dl>
        {item.emotions.length > 0 && <p>{item.emotions.join(', ')}</p>}
      </details>)}
    </section>}
  </>;
}
