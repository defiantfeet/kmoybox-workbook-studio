import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { StudioForm } from '../../../components/forms';
import { GrowthContentCopy } from '../../../components/growth-content-copy';
import { Heading, Shell } from '../../../components/studio';
import { modules, findModule } from '../../../lib/becoming/catalog';
import { saveGrowthContent } from '../../../lib/becoming/content-actions';
import { contentEditorPath, contentKinds, dailyReflectionDestination, dailyReflectionDestinationLabel, type ContentVersion } from '../../../lib/becoming/content-catalog';
import { editorContent } from '../../../lib/becoming/content-data';
import { editorAccess } from '../../../lib/workbooks/repository';
import { demo } from '../../../lib/session';
import { studioPath } from '../../../lib/studio-path';

export const dynamic = 'force-dynamic';

function status(version: ContentVersion) {
  if (version.state === 'published' && Date.parse(version.effective_at ?? '') > Date.now()) return 'scheduled';
  return version.state;
}

function stamp(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
}

export default async function GrowthContentEditor({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (demo) notFound();
  const { client, user } = await editorAccess();
  const params = await searchParams;
  const item = z.uuid().safeParse(params.item);
  if (params.item && !item.success) notFound();
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 120) : '';
  const kind = typeof params.kind === 'string' && Object.hasOwn(contentKinds, params.kind) ? params.kind : '';
  const state = typeof params.state === 'string' && ['draft','published','scheduled','archived'].includes(params.state) ? params.state : '';
  const page = typeof params.page === 'string' && /^\d{1,5}$/.test(params.page) ? Number(params.page) : 0;
  const historyPage = typeof params.history === 'string' && /^\d{1,5}$/.test(params.history) ? Number(params.history) : 0;
  const data = await editorContent(client, item.data, page, historyPage, { kind, query, state });
  if (item.success && !data.selected) notFound();
  const current = data.current;
  const source = params.copy === '1' && data.selected?.kind === 'exercise';
  const editing = source ? null : data.selected;
  const scheduledFor = editing && current?.effective_at && status(current) === 'scheduled'
    ? new Date(current.effective_at).toISOString()
    : undefined;
  const history = (offset: number) => {
    const filter = new URLSearchParams({ q: query, kind, state, page: String(offset) });
    return contentEditorPath + '?' + filter.toString();
  };
  return <Shell current="content-editor" name={String(user.user_metadata?.display_name ?? 'Editor')} sample={false}>
    <Link href="/content-editor" className="text-button back">Workbook content editor</Link>
    <Heading title="Personal Growth Content Manager" subtitle="Prepare and publish prompts and resources for the studio." />
    <div className="editor-layout">
      <section className="panel form-panel" aria-labelledby="growth-editor-list">
        <h2 id="growth-editor-list">Content library</h2>
        <form action={studioPath(contentEditorPath)} className="stack">
          <label>Search titles<input name="q" type="search" defaultValue={query} maxLength={120} /></label>
          <label>Content type<select name="kind" defaultValue={kind}><option value="">All types</option>
            {Object.entries(contentKinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <label>Status<select name="state" defaultValue={state}><option value="">All statuses</option>
            {['draft','published','scheduled','archived'].map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <button className="secondary">Apply filters</button>
        </form>
        {data.entries.length ? <ul className="editor-list">{data.entries.map(entry => <li key={entry.id}>
          <Link className="text-button" href={contentEditorPath + '?item=' + entry.id}>{entry.current.title}</Link>
          <small>{contentKinds[entry.kind]} · {status(entry.current)}</small>
        </li>)}</ul> : <p>No content matches these filters.</p>}
        <div className="growth-actions">
          {page > 0 && <Link href={history(page - 1)}>Previous page</Link>}
          {(page + 1) * data.size < data.total && <Link href={history(page + 1)}>Next page</Link>}
          <Link className="text-button" href={contentEditorPath}>New content</Link>
        </div>
      </section>
      <section className="panel form-panel" aria-labelledby="growth-edit-heading">
        <h2 id="growth-edit-heading">{editing ? 'Edit content' : 'Create content'}</h2>
        {params.saved === '1' && editing && <p role="status" className="feedback">Content saved.</p>}
        <StudioForm key={(editing?.id ?? 'new') + (current?.revision ?? 0)} className="stack"
          action={saveGrowthContent.bind(null, editing?.id ?? null, editing?.revision ?? 0)}>
          {editing ? <>
            <p>{contentKinds[editing.kind]} · {editing.module_slug === dailyReflectionDestination
              ? dailyReflectionDestinationLabel
              : editing.module_slug ? findModule(editing.module_slug)?.title : 'Default destination'}</p>
            <input type="hidden" name="kind" value={editing.kind} />
            <input type="hidden" name="target" value={editing.module_slug ?? ''} />
          </> : <>
            <label>Content type<select name="kind" defaultValue={source ? 'exercise' : 'prompt'}>
              {Object.entries(contentKinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <label>Destination<select name="target" defaultValue={source ? data.selected?.module_slug ?? '' : ''}>
              <option value="">Default destination for content type</option>
              <option value={dailyReflectionDestination}>{dailyReflectionDestinationLabel}</option>
              {modules.map(module => <option key={module.slug} value={module.slug}>{module.title}</option>)}
            </select></label>
          </>}
          <label>Title<input name="title" required maxLength={120} defaultValue={source ? current?.title.slice(0, 113) + ' (copy)' : current?.title} /></label>
          <label>Content<textarea name="body" rows={8} maxLength={8000} defaultValue={current?.body} /></label>
          <label>Category<input name="category" list="published-growth-categories" maxLength={120} defaultValue={current?.category} /></label>
          <datalist id="published-growth-categories">{data.categories.map(category => <option key={category.item_id} value={category.title} />)}</datalist>
          <label className="habit-check"><input name="available" type="checkbox" defaultChecked={current?.available ?? true} /> Module available (availability items only)</label>
          <label>Scheduled publication (UTC)<input type="datetime-local" name="schedule" step="any"
            defaultValue={scheduledFor?.slice(0, -1)} /></label>
          {scheduledFor && <p>Scheduled for <time dateTime={scheduledFor}>{stamp(scheduledFor)}</time></p>}
          <div className="growth-actions">
            <button className="secondary" name="action" value="draft">Save draft</button>
            <button className="primary" name="action" value="published">Publish now</button>
            <button className="secondary" name="action" value="scheduled">Schedule publication</button>
            {editing && <button className="text-button" name="action" value="archived">Archive content</button>}
          </div>
        </StudioForm>
        {editing && current && <section className="editor-preview" aria-labelledby="growth-preview-heading">
          <h3 id="growth-preview-heading">Preview of saved version</h3>
          <GrowthContentCopy copy={current} kind={editing.kind} />
          {editing.kind === 'exercise' && <Link href={contentEditorPath + '?item=' + editing.id + '&copy=1'}>Create a draft from this template</Link>}
          <h3>Version history</h3>
          <ul className="editor-list">{data.versions.map(version => <li key={version.revision}>
            <details><summary>Version {version.revision} · {status(version)} · Saved at <time dateTime={version.saved_at}>{stamp(version.saved_at)}</time></summary>
              {version.effective_at && <p>{status(version) === 'scheduled' ? 'Scheduled for' : 'Effective'} <time dateTime={version.effective_at}>{stamp(version.effective_at)}</time></p>}
              <GrowthContentCopy copy={version} kind={editing.kind} />
            </details>
          </li>)}</ul>
          <div className="growth-actions">
            {historyPage > 0 && <Link href={contentEditorPath + '?item=' + editing.id + '&history=' + (historyPage - 1)}>Newer versions</Link>}
            {data.moreHistory && <Link href={contentEditorPath + '?item=' + editing.id + '&history=' + (historyPage + 1)}>Older versions</Link>}
          </div>
        </section>}
      </section>
    </div>
    <section className="panel form-panel growth-panel" aria-labelledby="growth-engagement">
      <h2 id="growth-engagement">Module visits last calendar month (UTC)</h2>
      <p>Each signed-in member counts once per module. Results appear in groups of ten, starting at ten members.</p>
      {data.engagement.length ? <ul className="editor-list">{data.engagement.map(entry => <li key={entry.module_slug}>
        {findModule(entry.module_slug)?.title ?? entry.module_slug}: {entry.member_floor}–{entry.member_floor + 9} members
      </li>)}</ul> : <p>No module has enough recorded visits to display yet.</p>}
    </section>
  </Shell>;
}
