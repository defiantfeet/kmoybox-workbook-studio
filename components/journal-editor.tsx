'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Journal, WorkbookLink } from '../lib/model';
import { autosaveJournal } from '../lib/personal/actions';
import { moods } from '../lib/personal/shared';
import { WorkbookConnection } from './workbook-connection';

const blank = { title: '', body: '', mood: '', workbook_ref: '' };
type Fields = typeof blank;

export function JournalEditor({ entry, draftId, links, attached }: { entry?: Journal; draftId: string; links: WorkbookLink[]; attached?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [fields, setFields] = useState<Fields>(() => entry
    ? { title: entry.title, body: entry.body, mood: entry.mood ?? '', workbook_ref: entry.workbook_ref ?? '' } : { ...blank, workbook_ref: attached ?? '' });
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const id = useRef(entry?.id ?? draftId);
  const revision = useRef(entry?.updated_at ?? entry?.created_at ?? null);
  const last = useRef(fields);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(fields);
  active.current = fields;
  const dirty = JSON.stringify(fields) !== JSON.stringify(last.current);

  const persist = useCallback(async () => {
    clearTimeout(timer.current);
    const next = active.current;
    if (pending.current || JSON.stringify(next) === JSON.stringify(last.current) || (!next.title.trim() && !next.body.trim())) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    setMessage('Saving…');
    try {
      const result = await autosaveJournal(id.current, revision.current, next);
      if ('error' in result) {
        setFailed(true);
        setMessage(result.error);
        return;
      }
      revision.current = result.updatedAt;
      last.current = next;
      setMessage('Saved.');
    } catch {
      setFailed(true);
      setMessage('Could not save yet. Use the save button to retry.');
    } finally {
      pending.current = false;
      setBusy(false);
      if (next !== active.current) timer.current = setTimeout(persist, 500);
    }
  }, []);

  useEffect(() => {
    if (failed || !dirty) return;
    timer.current = setTimeout(persist, 500);
    return () => clearTimeout(timer.current);
  }, [dirty, fields, persist, failed]);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
    function confirmNavigation(event: MouseEvent) {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey
        || event.shiftKey || event.altKey || link.target === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.href);
      if (destination.origin !== location.origin || destination.pathname !== location.pathname
        || destination.search !== location.search) {
        if (!window.confirm('This journal entry has unsaved changes. Leave anyway?')) event.preventDefault();
      }
    }
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', confirmNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', confirmNavigation, true);
    };
  }, [dirty]);

  function update<T extends keyof Fields>(key: T, value: Fields[T]) {
    setFailed(false);
    setCopyStatus('');
    setFields(previous => ({ ...previous, [key]: value }));
  }

  function startAnother() {
    id.current = crypto.randomUUID();
    revision.current = null;
    last.current = blank;
    setFields(blank);
    setFailed(false);
    setMessage('');
  }

  return <form className="stack journal-form" onSubmit={event => { event.preventDefault(); void persist(); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) void persist(); }}>
    <fieldset disabled={!ready}>
      <label>Title<input maxLength={140} value={fields.title} onChange={event => update('title', event.target.value)} /></label>
      <label>{entry ? 'Entry' : 'What’s on your mind?'}<textarea rows={5} maxLength={10000}
        value={fields.body} onChange={event => update('body', event.target.value)} /></label>
      <label>Mood check-in (optional)<select value={fields.mood} onChange={event => update('mood', event.target.value)}>
        <option value="">No mood selected</option>
        {Object.entries(moods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <WorkbookConnection label="Workbook response (optional)" links={links} value={fields.workbook_ref}
        onChange={value => update('workbook_ref', value)} />
      <div className="actions">
        <button className="primary" disabled={busy}>{entry ? 'Update entry' : 'Save entry'}</button>
        {!entry && revision.current && <button className="secondary" type="button" disabled={dirty || busy} onClick={startAnother}>Start another entry</button>}
        {failed && <button className="secondary" type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText([fields.title, fields.body].filter(Boolean).join('\n\n'));
            setCopyStatus('Unsaved text copied.');
          } catch {
            setCopyStatus('Copy is unavailable. Select and copy your text manually.');
          }
        }}>Copy unsaved text</button>}
      </div>
    </fieldset>
    <p role={failed ? 'alert' : 'status'} className={failed ? 'error' : 'feedback'}>{dirty && !failed && !busy ? 'Unsaved changes.' : message}</p>
    {failed && copyStatus && <p role="status">{copyStatus}</p>}
  </form>;
}
