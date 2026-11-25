'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { ActionState } from '../lib/actions';
import { saveExercise } from '../lib/becoming/actions';
import type { socialModule } from '../lib/becoming/data';
import { saveSocial } from '../lib/becoming/social-actions';
import { socialSections, socialKeys, socialPath, socialPrompts, socialCircles, socialScenarios, communityIdeas,
  socialGoalIdeas, socialGoalStatuses, type SocialFields, type SocialGoal, type SocialRecord, type SocialSection } from '../lib/becoming/social';
import { findModule } from '../lib/becoming/catalog';
import { StudioForm } from './forms';
import { GrowthFields } from './growth-fields';

type Props = Awaited<ReturnType<typeof socialModule>> & {
  section: SocialSection; relationshipLabel?: string; page: number; today: string; monday: string; timezone: string; preview: boolean;
};
type Editor = { kind: string; entryKey?: string; record?: SocialRecord; preview: boolean };
const linkedModules = [
  ['Identity Mapping', 'identity-mapping'], ['Values Assessment', 'values-assessment'],
  ['Relationship Inventory', 'relationship-inventory'], ['Boundary Builder', 'boundary-builder'], ['Mood Tracker', 'mood-tracker'],
];

function EditorForm({ kind, entryKey = '', record, preview, children, label, clear = false }: Editor & {
  children: (fields: SocialFields, set: (key: string, value: string) => void) => ReactNode; label: string; clear?: boolean;
}) {
  const [fields, setFields] = useState<SocialFields>(record?.fields ?? {});
  const set = (key: string, value: string) => setFields(current => ({ ...current, [key]: value }));
  const save = saveSocial.bind(null, kind, entryKey, record?.id ?? '', record?.updatedAt ?? '');
  async function submit(previous: ActionState, form: FormData) {
    const result = await save(previous, form);
    if (!result.error && clear) setFields({});
    return result;
  }
  return <StudioForm action={submit} className="stack growth-form social-form">
    {Object.entries(fields).map(([key, value]) => <input key={key} type="hidden" name={'field-' + key} value={value} />)}
    {children(fields, set)}
    <button className="primary" disabled={preview}>{label}</button>
  </StudioForm>;
}

function Notes({ prompts, fields, set }: { prompts: readonly string[]; fields: SocialFields; set: (key: string, value: string) => void }) {
  return <div className="social-prompt-grid">
    {prompts.map((prompt, index) => <label key={prompt}>{prompt}
      <textarea rows={2} maxLength={2000} required={index === 0 && prompt === socialPrompts.journal[0]}
        value={fields[String(index)] ?? ''} onChange={event => set(String(index), event.target.value)} />
    </label>)}
  </div>;
}

function Ecosystem({ record, preview }: { record?: SocialRecord; preview: boolean }) {
  const [circle, selectCircle] = useState(0);
  return <>
    <p>Choose a circle to rename it or add private notes. You decide what belongs in each circle.</p>
    <EditorForm kind="ecosystem" record={record} preview={preview} label="Save ecosystem map">
      {(fields, set) => <>
        <div className="social-circles" role="group" aria-label="Ecosystem circles">
          {socialCircles.map((name, index) => <button key={name} type="button" aria-pressed={circle === index}
            className="secondary social-circle" onClick={() => selectCircle(index)}>{fields['label' + index] || name}</button>)}
        </div>
        <fieldset className="social-circle-editor" key={circle}>
          <legend>{socialCircles[circle]} circle</legend>
          <label>Circle name<input maxLength={50} value={fields['label' + circle] ?? ''} placeholder={socialCircles[circle]}
            onChange={event => set('label' + circle, event.target.value)} /></label>
          <label>People, places, or ideas in this circle<textarea rows={3} maxLength={2000} value={fields['notes' + circle] ?? ''}
            onChange={event => set('notes' + circle, event.target.value)} /></label>
        </fieldset>
      </>}
    </EditorForm>
  </>;
}

function Practice({ records, preview }: { records: SocialRecord[]; preview: boolean }) {
  const [scenario, select] = useState(0);
  const [topic, context, example] = socialScenarios[scenario];
  const key = String(scenario);
  const record = records.find(item => item.key === key);
  return <>
    <p>These are fictional practice situations. Adapt the wording to your culture and communication style. You can practice privately or skip any scenario.</p>
    <label className="values-label">Practice scenario<select value={scenario} onChange={event => select(Number(event.target.value))}>
      {socialScenarios.map(([label], index) => <option key={label} value={index}>{label}</option>)}
    </select></label>
    <h3>{topic}</h3>
    <p>{context}</p>
    <p><strong>Example response</strong> {example}</p>
    <EditorForm key={key} kind="practice" entryKey={key} record={record} preview={preview} label="Save practice">
      {(fields, set) => <>
        <button type="button" className="secondary" disabled={!!fields['0']} onClick={() => set('0', example)}>Use example as a starting point</button>
        <Notes prompts={socialPrompts.practice} fields={fields} set={set} />
      </>}
    </EditorForm>
  </>;
}

function CommunityPlan({ record, preview }: { record?: SocialRecord; preview: boolean }) {
  return <EditorForm kind="community" record={record} preview={preview} clear={!record} label={record ? 'Update plan' : 'Save community plan'}>
    {(fields, set) => <>
      <label>Activity type (optional)<select value={fields.idea ?? ''} onChange={event => set('idea', event.target.value)}>
        <option value="">Choose an activity type</option>{communityIdeas.map(idea => <option key={idea}>{idea}</option>)}
      </select></label>
      <Notes prompts={socialPrompts.community} fields={fields} set={set} />
    </>}
  </EditorForm>;
}

function Goal({ goal, preview }: { goal?: SocialGoal; preview: boolean }) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [target, setTarget] = useState(goal?.target ?? '');
  const [status, setStatus] = useState<SocialGoal['status']>(goal?.status ?? 'Active');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const save = saveSocial.bind(null, 'goals', '', goal?.id ?? '', goal?.updatedAt ?? '');
  async function submit(previous: ActionState, form: FormData) {
    const result = await save(previous, form);
    if (!result.error && !goal) {
      setTitle(''); setTarget(''); setStatus('Active'); setNotes('');
    }
    return result;
  }
  return <StudioForm action={submit} className="stack growth-form social-form">
    {!goal && <div className="growth-actions">{socialGoalIdeas.map(idea =>
      <button key={idea} type="button" className="secondary" disabled={!!title} onClick={() => setTitle(idea)}>{idea}</button>)}</div>}
    <label>My social goal<input name="title" maxLength={140} required value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label>Target date (optional)<input type="date" name="target" value={target} onChange={event => setTarget(event.target.value)} /></label>
    <label>Goal status<select name="status" value={status} onChange={event => {
      const next = socialGoalStatuses.find(value => value === event.target.value);
      if (next) setStatus(next);
    }}>{socialGoalStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Support, adjustments, or next steps (optional)<textarea name="notes" rows={2} maxLength={2000}
      value={notes} onChange={event => setNotes(event.target.value)} /></label>
    <button className="primary" disabled={preview}>{goal ? 'Update social goal' : 'Add social goal'}</button>
  </StudioForm>;
}

function JournalEntry({ record, today, preview, relationshipLabel }: { relationshipLabel?: string; record?: Props['interactions'][number]; today: string; preview: boolean }) {
  const [day, setDay] = useState(record?.day ?? today);
  return <EditorForm kind="journal" record={record} preview={preview} clear={!record} label={record ? 'Update interaction' : 'Save interaction'}>
    {(fields, set) => <>
      <label>Interaction date<input name="day" type="date" max={today} required value={day} onChange={event => setDay(event.target.value)} /></label>
      {record?.legacy && <p className="growth-note">{record.legacy}</p>}
      {relationshipLabel && !fields['1'] && <button type="button" className="secondary" onClick={() => set('1', relationshipLabel)}>
        Use the Relationship Inventory label
      </button>}
      <Notes prompts={socialPrompts.journal} fields={fields} set={set} />
    </>}
  </EditorForm>;
}

export function SocialIntegration({ section, page, records, goals, interactions, progress, legacy, earlier, hasMore, preview, today, monday, timezone, relationshipLabel }: Props) {
  const module = findModule('social-integration')!;
  const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
  const timestamp = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: timezone });
  const dayLabel = (day: string) => date.format(new Date(day + 'T00:00:00Z'));
  const pageHref = (number: number) => socialPath + '?section=' + section + '&historyPage=' + number + '#social-section';
  let body: ReactNode;
  switch (section) {
    case 'ecosystem':
      body = <Ecosystem record={records[0]} preview={preview} />;
      break;
    case 'practice':
      body = <Practice records={records} preview={preview} />;
      break;
    case 'community':
      body = <>
        <p>Use these activity types to plan your own search. Check the details with the organizer before committing. It’s fine to observe, participate remotely, or change your plans.</p>
        <CommunityPlan preview={preview} />
        <h3>Saved community plans</h3>
        {records.length ? records.map(record => <details key={record.id}>
          <summary>{record.fields['0'] || record.fields.idea || 'Community plan'}</summary><CommunityPlan record={record} preview={preview} />
        </details>) : <p className="muted">Your plans will appear here when you save them.</p>}
      </>;
      break;
    case 'goals':
      body = <>
        <p>Choose a goal that matters to you. You can adjust, postpone, or decline it as your needs change.</p>
        <Link className="text-button" href="/becoming/habit-tracker?source=social">Create a social habit</Link>
        <Goal preview={preview} />
        <h3>Saved social goals</h3>
        {goals.length ? goals.map(goal => <details key={goal.id}>
          <summary>{goal.title} · {goal.status}</summary><Goal goal={goal} preview={preview} />
        </details>) : <p className="muted">Start with a connection you’d like to make or maintain.</p>}
      </>;
      break;
    case 'journal':
      body = <>
        <p>Write as much or as little as you’d like. An activity and date are enough to save an entry.</p>
        <JournalEntry today={today} preview={preview} relationshipLabel={relationshipLabel} />
        <h3>Past interactions</h3>
        {interactions.length ? interactions.map(entry => <details key={entry.id}>
          <summary>{entry.fields['0'] || 'Earlier interaction'} · {dayLabel(entry.day)}</summary>
          <JournalEntry record={entry} today={today} preview={preview} />
        </details>) : <p className="muted">Saved interactions will appear here.</p>}
      </>;
      break;
    case 'weekly':
      body = <>
        <p>Week of {dayLabel(monday)}. Reflect on what mattered to you, including time you chose to spend alone.</p>
        <EditorForm key={monday} kind="weekly" entryKey={monday} record={records.find(item => item.key === monday)} preview={preview} label="Save this week’s reflection">
          {(fields, set) => <Notes prompts={socialPrompts.weekly} fields={fields} set={set} />}
        </EditorForm>
        <h3>Earlier weeks</h3>
        {records.filter(record => record.key !== monday).length ? records.filter(record => record.key !== monday).map(record => <details key={record.id}>
          <summary>Week of {dayLabel(record.key)}</summary>
          <EditorForm kind="weekly" entryKey={record.key} record={record} preview={preview} label="Update weekly reflection">
            {(fields, set) => <Notes prompts={socialPrompts.weekly} fields={fields} set={set} />}
          </EditorForm>
        </details>) : <p className="muted">Earlier reflections will appear here after the week ends.</p>}
      </>;
      break;
    default:
      body = <>
        <p>{section === 'awareness'
          ? 'Choose any prompts that help you understand what kind of connection suits you. Your preferences can change across settings and over time.'
          : 'Reflect on how expectations and systems shape belonging. You can leave any question blank or return to it later.'}</p>
        <EditorForm kind={section} record={records[0]} preview={preview} label="Save reflection">
          {(fields, set) => <Notes prompts={socialPrompts[section]} fields={fields} set={set} />}
        </EditorForm>
        {legacy && <div className="social-legacy">
          <h3>Your connection practice draft</h3>
          <p>Revisit your earlier draft or a step you sent from Identity Mapping or Values Assessment.</p>
          <GrowthFields action={saveExercise.bind(null, 'social-integration')} fields={module.fields} answers={legacy.answers}
            revision={legacy.updated_at} exercise disabled={preview} />
        </div>}
        {earlier.length > 0 && <div className="social-legacy"><h3>Earlier connection exercises</h3>
          {earlier.map(item => <details key={item.id}><summary>{timestamp.format(new Date(item.completed_at))}</summary>
            <dl className="growth-list">{module.fields.map((field, index) =>
              <div key={field.label}><dt>{field.label}</dt><dd className="growth-note">{item.answers[String(index)]}</dd></div>)}</dl>
          </details>)}
        </div>}
      </>;
  }
  return <>
    <nav className="panel growth-panel social-nav" aria-label="Social Integration sections">
      <ul className="growth-list">{socialKeys.map(key => <li key={key}>
        <Link href={socialPath + '?section=' + key + '#social-section'} aria-current={section === key ? 'page' : undefined}>{socialSections[key]}</Link>
      </li>)}</ul>
    </nav>
    <section className="panel growth-panel social-section" aria-labelledby="social-section">
      <h2 id="social-section" tabIndex={-1}>{socialSections[section]}</h2>
      {body}
      {(page > 1 || hasMore) && <nav className="growth-actions" aria-label="Social activity history pages">
        {page > 1 && <Link href={pageHref(page - 1)}>Newer entries</Link>}
        {hasMore && <Link href={pageHref(page + 1)}>Older entries</Link>}
      </nav>}
    </section>
    <section className="panel growth-panel" aria-labelledby="social-progress">
      <h2 id="social-progress">My progress</h2>
      <p>Mark any sections you want to remember visiting. You can change these choices at any time.</p>
      <EditorForm kind="progress" record={progress ?? undefined} preview={preview} label="Save progress preferences">
        {(fields, set) => <div className="social-progress-options">{socialKeys.map(key => <label key={key}>
          <input type="checkbox" checked={fields[key] === 'yes'} onChange={event => set(key, event.target.checked ? 'yes' : '')} /> {socialSections[key]}
        </label>)}</div>}
      </EditorForm>
    </section>
    <nav className="panel growth-panel" aria-label="Related Personal Growth modules">
      <h2>Related modules</h2>
      <ul className="growth-list">{linkedModules.map(([label, slug]) => <li key={slug}><Link href={'/becoming/' + slug}>{label}</Link></li>)}</ul>
    </nav>
  </>;
}
