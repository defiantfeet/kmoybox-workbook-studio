'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { deleteMood, saveMood, saveMoodSettings } from '../lib/becoming/mood-actions';
import { contextTags, detailNotes, detailScales, dueMoodSlots, emptyMood, moodPath, moodSlots, slotNames,
  type MoodInput, type MoodRecord, type MoodSettings } from '../lib/becoming/mood';
import { weekdays, addDays } from '../lib/becoming/habits';
import { EmotionPicker } from './emotion-picker';
import { StudioForm } from './forms';
import { MoodCharts, moodDay, moodTime } from './mood-charts';

type Props = {
  entries: MoodRecord[]; selected: MoodRecord | null; settings: MoodSettings; habits: string[]; social: string[]; timezones: string[];
  today: string; day: string; timezone: string; now: string; slot: typeof moodSlots[number] | null;
  preview: boolean; editing: boolean; saved: boolean; deleted: boolean; scheduledToday: string[]; legacyCard: ReactNode; offeredEmotions: string[]; centralized?: boolean;
};
const zoneClock = (now: string, timezone: string) => {
  const date = new Date(now);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return { day, time, weekday: new Date(day + 'T00:00:00Z').getUTCDay() || 7 };
};
const entryLink = (entry: MoodRecord, edit = false) => moodPath + '?day=' + entry.day + '&entry=' + entry.id +
  (edit ? '&edit=1#mood-editor' : '#mood-history');

function Scale({ title, value, update, required = false }: {
  title: string; value: number | null; update: (value: number | null) => void; required?: boolean;
}) {
  return <label>{title}<select required={required} value={value ?? ''} onChange={event => update(event.target.value ? Number(event.target.value) : null)}>
    <option value="">{required ? 'Choose a rating' : 'Leave unrated'}</option>
    {Array.from({ length: 10 }, (_, index) => <option key={index}>{index + 1}</option>)}
  </select></label>;
}

function Editor({ record, slot, preview, offeredEmotions }: { record: MoodRecord | null; slot: Props['slot']; preview: boolean; offeredEmotions: string[] }) {
  const [entry, setEntry] = useState<MoodInput>(record ?? emptyMood);
  const [detailed, setDetailed] = useState(Boolean(record && (Object.keys(record.details).length || Object.keys(record.scales).length)));
  const [custom, setCustom] = useState('');
  const [confirmed, confirm] = useState(false);
  const patch = (fields: Partial<MoodInput>) => setEntry(previous => ({ ...previous, ...fields }));
  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && entry.tags.length < 20 && !entry.tags.some(tag => tag.toLowerCase() === trimmed.toLowerCase())) {
      patch({ tags: [...entry.tags, trimmed] });
      setCustom('');
    }
  };
  return <section className="panel growth-panel" aria-labelledby="mood-editor">
    <h2 id="mood-editor" tabIndex={-1}>{record ? 'Edit check-in' : slot ? slotNames[slot] + ' check-in' : 'Add a voluntary check-in'}</h2>
    {(record || slot) && <Link className="text-button" href={moodPath + '#mood-editor'}>Start a voluntary check-in</Link>}
    <StudioForm action={saveMood.bind(null, record?.id ?? '', record?.revision ?? '', slot)} className="stack growth-form mood-form">
      <input type="hidden" name="entry" value={JSON.stringify(entry)} />
      <h3>Quick check-in</h3>
      {offeredEmotions.length > 0 && !entry.emotions.length && <button className="secondary" type="button"
        onClick={() => patch({ emotions: offeredEmotions })}>Use labels from my Emotional Wheel entry</button>}
      {record?.legacy && record.rating === null && <p>Earlier check-in: {record.legacy}. An overall rating is optional for this entry.</p>}
      <div className="future-grid">
        <Scale title="Overall mood rating (1 to 10)" value={entry.rating} update={rating => patch({ rating })} required={!record?.legacy} />
        <Scale title="Energy rating (optional)" value={entry.energy} update={energy => patch({ energy })} />
      </div>
      <details><summary>Choose emotions (optional){entry.emotions.length ? ' · ' + entry.emotions.join(', ') : ''}</summary>
        <EmotionPicker value={entry.emotions} onChange={emotions => patch({ emotions })} showWheel={false} />
      </details>
      <label>Quick note (optional)<textarea rows={2} maxLength={2000} value={entry.note}
        onChange={event => patch({ note: event.target.value })} /></label>
      <details open={detailed} onToggle={event => setDetailed(event.currentTarget.open)}>
        <summary>Detailed check-in (optional)</summary>
        <div className="future-grid">
          {Object.entries(detailScales).map(([key, title]) => {
            const field = key as keyof typeof detailScales;
            return <Scale key={field} title={title + ' (optional)'} value={entry.scales[field] ?? null} update={value => {
              const scales = { ...entry.scales };
              if (value === null) delete scales[field]; else scales[field] = value;
              patch({ scales });
            }} />;
          })}
          {Object.entries(detailNotes).map(([key, title]) => {
            const field = key as keyof typeof detailNotes;
            return <label key={field}>{title} (optional)<textarea rows={2} maxLength={2000} value={entry.details[field] ?? ''}
              onChange={event => patch({ details: { ...entry.details, [field]: event.target.value } })} /></label>;
          })}
        </div>
      </details>
      <details>
        <summary>Context tags (optional)</summary>
        <div className="growth-actions">{contextTags.map(tag => {
          const active = entry.tags.some(item => item.toLowerCase() === tag.toLowerCase());
          return <button key={tag} className="secondary" type="button" aria-pressed={active} disabled={!active && entry.tags.length >= 20}
            onClick={() => active ? patch({ tags: entry.tags.filter(item => item.toLowerCase() !== tag.toLowerCase()) }) : addTag(tag)}>{tag}</button>;
        })}</div>
        <label>Custom tag<input maxLength={40} value={custom} onChange={event => setCustom(event.target.value)} /></label>
        <button className="secondary" type="button" disabled={!custom.trim() || entry.tags.length >= 20} onClick={() => addTag(custom)}>Add custom tag</button>
        {entry.tags.length > 0 && <ul className="growth-list" aria-label="Selected context tags">{entry.tags.map(tag => <li key={tag}>
          {tag} <button className="text-button" type="button" aria-label={'Remove tag ' + tag}
            onClick={() => patch({ tags: entry.tags.filter(item => item !== tag) })}>Remove</button>
        </li>)}</ul>}
      </details>
      <button className="primary" disabled={preview}>Save check-in</button>
    </StudioForm>
    {record && <details><summary>Delete this check-in</summary>
      <StudioForm action={deleteMood.bind(null, record.id, record.revision)} className="stack growth-form">
        <label className="habit-check"><input type="checkbox" name="confirm" value="yes" checked={confirmed} onChange={event => confirm(event.target.checked)} /> Confirm deletion</label>
        <button className="secondary" disabled={preview || !confirmed}>Delete check-in permanently</button>
      </StudioForm>
    </details>}
  </section>;
}

function Preferences({ stored, timezone, timezones, preview, centralized }: { centralized: boolean; stored: MoodSettings; timezone: string; timezones: string[]; preview: boolean }) {
  const [settings, setSettings] = useState(stored);
  const [zone, setZone] = useState(timezone);
  const patch = (fields: Partial<MoodSettings>) => setSettings(previous => ({ ...previous, ...fields }));
  return <details className="panel growth-panel">
    <summary>Schedule and reminder preferences</summary>
    <p>Clear a time to disable its scheduled slot. Voluntary check-ins are always available.</p>
    <StudioForm action={saveMoodSettings} className="stack growth-form mood-form">
      <input type="hidden" name="settings" value={JSON.stringify(settings)} />
      <div className="future-grid">
        {moodSlots.map(slot => <label key={slot}>{slotNames[slot]} time<input type="time" value={settings.times[slot] ?? ''}
          onChange={event => patch({ times: { ...settings.times, [slot]: event.target.value || null } })} /></label>)}
        <label>Studio timezone<select name="timezone" value={zone} onChange={event => setZone(event.target.value)}>
          {timezones.map(value => <option key={value}>{value}</option>)}
        </select></label>
      </div>
      <p className="muted">This timezone is shared with the Studio calendar. Earlier entries keep their recorded date and timezone.</p>
      <fieldset className="mood-days"><legend>Days to schedule check-ins</legend>
        {weekdays.map((day, index) => <label className="habit-check" key={day}>
          <input type="checkbox" checked={settings.days.includes(index + 1)} onChange={event =>
            patch({ days: event.target.checked ? [...settings.days, index + 1] : settings.days.filter(value => value !== index + 1) })} /> {day}
        </label>)}
      </fieldset>
      {centralized ? <Link className="text-button" href="/becoming/notifications">Manage quiet hours and notification channels</Link> : <>
      <label className="habit-check"><input type="checkbox" checked={settings.reminders} onChange={event => patch({ reminders: event.target.checked })} />
        Show in-app reminders while the tracker is open</label>
      <div className="future-grid">
        <label>Quiet hours start (optional)<input type="time" value={settings.quietStart ?? ''}
          onChange={event => patch({ quietStart: event.target.value || null })} /></label>
        <label>Quiet hours end (optional)<input type="time" value={settings.quietEnd ?? ''}
          onChange={event => patch({ quietEnd: event.target.value || null })} /></label>
      </div></>}
      <button className="primary" disabled={preview}>Save mood preferences</button>
    </StudioForm>
  </details>;
}

function EntryDetails({ entry }: { entry: MoodRecord }) {
  return <div className="mood-entry-details">
    <p>Overall mood: {entry.rating === null ? 'No numerical rating' : entry.rating + ' / 10'} · Energy: {entry.energy === null ? 'Unrated' : entry.energy + ' / 10'}</p>
    {entry.emotions.length > 0 && <p>Emotions: {entry.emotions.join(', ')}</p>}
    {entry.legacy && entry.emotions.length === 0 && <p>Earlier mood label: {entry.legacy}</p>}
    {entry.tags.length > 0 && <p>Tags: {entry.tags.join(', ')}</p>}
    {entry.note && <p className="growth-note">{entry.note}</p>}
    {Object.entries(detailScales).map(([key, name]) => {
      const value = entry.scales[key as keyof typeof detailScales];
      return value !== undefined && <p key={key}>{name}: {value} / 10</p>;
    })}
    {Object.entries(detailNotes).map(([key, name]) => {
      const value = entry.details[key as keyof typeof detailNotes];
      return value && <p className="growth-note" key={key}><strong>{name}</strong><br />{value}</p>;
    })}
    <Link className="text-button" href={entryLink(entry, true)}>Edit or delete check-in</Link>
    <Link className="text-button" href={'/becoming/body-awareness-map?moodEntry=' + entry.id + '#body-practice'}>
      Reflect on this check-in in Body Awareness
    </Link>
  </div>;
}

export function MoodTracker({ entries, selected, settings, habits, social, timezones, today, day, timezone, now, slot,
  preview, editing, saved, deleted, scheduledToday, legacyCard, offeredEmotions, centralized = false }: Props) {
  const [clock, setClock] = useState(now);
  const [dismissed, dismiss] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date().toISOString()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const local = zoneClock(clock, timezone);
  const due = dueMoodSlots(settings, local.time, local.weekday, local.day === today ? scheduledToday as MoodRecord['slot'][] : []);
  const dueKey = local.day + ':' + due.join(',');
  const [requestedDay, setHistoryDay] = useState<string | null>(null);
  const historyDay = requestedDay ?? day;
  return <>
    <section className="panel growth-panel" aria-labelledby="mood-schedule">
      <h2 id="mood-schedule">Scheduled check-ins</h2>
      {centralized && <Link className="text-button" href="/becoming/notifications">Manage reminder delivery</Link>}
      {!centralized && due.length > 0 && !preview && dismissed !== dueKey && <div className="habit-reminders">
        <p role="status">A Studio check-in is available.</p>
        <button className="text-button" type="button" onClick={() => dismiss(dueKey)}>Dismiss reminder</button>
      </div>}
      <ul className="growth-list mood-slots">{moodSlots.map(value => {
        const time = settings.times[value];
        if (!time || !settings.days.includes(new Date(today + 'T00:00:00Z').getUTCDay() || 7)) return null;
        const existing = entries.find(item => item.day === today && item.slot === value);
        return <li key={value}><strong>{slotNames[value]}</strong> <time>{time}</time>
          {existing ? <Link href={entryLink(existing, true)}>Edit {slotNames[value].toLowerCase()} check-in</Link>
            : scheduledToday.includes(value) ? <Link href={moodPath + '#mood-history'}>Review saved check-in</Link>
              : <Link href={moodPath + '?slot=' + value + '#mood-editor'}>Open {slotNames[value].toLowerCase()} check-in</Link>}
        </li>;
      })}</ul>
      {(!settings.days.includes(new Date(today + 'T00:00:00Z').getUTCDay() || 7) || !Object.values(settings.times).some(Boolean)) &&
        <p className="muted">No check-ins are scheduled today.</p>}
      <Link className="text-button" href={moodPath + '#mood-editor'}>Add a voluntary check-in</Link>
    </section>
    <Editor offeredEmotions={offeredEmotions} record={editing ? selected : null} slot={slot} preview={preview} />
    <Preferences centralized={centralized} stored={settings} timezone={timezone} timezones={timezones} preview={preview} />
    <section className="panel growth-panel" aria-labelledby="mood-history">
      <h2 id="mood-history" tabIndex={-1}>Mood history</h2>
      {saved && <p role="status">Check-in saved.</p>}
      {deleted && <p role="status">Check-in deleted.</p>}
      <div className="growth-actions">
        <label className="values-label">History ending on<input type="date" min="1900-01-01" max={today} value={historyDay}
          onChange={event => setHistoryDay(event.target.value)} /></label>
        {historyDay && historyDay <= today && historyDay >= '1900-01-01' && <Link href={moodPath + '?day=' + historyDay + '#mood-history'}>View this period</Link>}
        {addDays(day, -30) >= '1900-01-01' && <Link href={moodPath + '?day=' + addDays(day, -30) + '#mood-history'}>Earlier 30 days</Link>}
        {day !== today && <Link href={moodPath + '?day=' + today + '#mood-history'}>Return to today</Link>}
      </div>
      {entries.length === 0 ? <p className="muted">No check-ins were recorded in this period.</p> : <ul className="growth-list mood-history">
        {entries.map(entry => <li key={entry.id}><details open={entry.id === selected?.id || undefined}>
          <summary>{moodDay(entry.day)} · {entry.slot && entry.slot !== 'daily' ? slotNames[entry.slot] : entry.slot === 'daily' ? 'Daily' : 'Voluntary'} · {moodTime(entry)}</summary>
          <EntryDetails entry={entry} />
        </details></li>)}
      </ul>}
      <a className="text-button" href="/becoming/mood-tracker/export" download>Export my mood check-ins</a>
    </section>
    <MoodCharts entries={entries} day={day} habits={habits} social={social} />
    {legacyCard}
  </>;
}
