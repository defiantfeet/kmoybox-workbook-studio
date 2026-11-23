'use client';

import { useState } from 'react';
import type { Journal, WorkbookLink } from '../lib/model';
import { deleteJournalEntry } from '../lib/personal/actions';
import { moods } from '../lib/personal/shared';
import { StudioForm } from './forms';
import { JournalEditor } from './journal-editor';

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' });

export function JournalHistory({ entries: saved, links }: { entries: Journal[]; links: WorkbookLink[] }) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const term = search.toLocaleLowerCase();
  const entries = saved.filter(entry => !term || (entry.title + '\n' + entry.body).toLocaleLowerCase().includes(term));
  return <section className="dashboard-section stack" aria-labelledby="entries-title">
    <h2 id="entries-title">Past entries</h2>
    <form className="actions journal-search" onSubmit={event => { event.preventDefault(); setSearch(input.trim()); }}>
      <label>Search past reflections<input type="search" maxLength={120} value={input} onChange={event => setInput(event.target.value)} /></label>
      <button className="secondary">Search</button>
    </form>
    {!entries.length && <p className="panel empty">{search ? 'No reflections match your search.' : 'Your saved entries will appear here.'}</p>}
    {entries.map(entry => <details className="panel form-panel" key={entry.id}>
      <summary><strong>{entry.title || 'Untitled reflection'}</strong>
        <time dateTime={entry.created_at}>{dateTime.format(new Date(entry.created_at))}</time>
        {entry.mood && <span> · {moods[entry.mood as keyof typeof moods]}</span>}
      </summary>
      <div className="edit">
        <JournalEditor entry={entry} draftId={entry.id} links={links} />
        <StudioForm action={deleteJournalEntry.bind(null, entry.id)} className="journal-delete">
          <button className="secondary">Delete entry</button>
        </StudioForm>
      </div>
    </details>)}
  </section>;
}
