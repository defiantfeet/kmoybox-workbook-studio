import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createWorkbook, publishModule } from '../lib/workbooks/actions';
import { editorLibrary } from '../lib/workbooks/repository';
import { ordered, slugSchema } from '../lib/workbooks/schema';
import { StudioForm } from './forms';
import { ModuleEditor } from './module-editor';
import { contentEditorPath } from '../lib/becoming/content-catalog';
import { demo } from '../lib/session';
import { Heading } from './studio';

export async function ContentEditor({ query }: { query: { workbook?: string; module?: string; saved?: string } }) {
  const { books, modules } = await editorLibrary();
  const book = books.find(item => item.slug === query.workbook);
  if (query.workbook && !book) notFound();
  const drafts = ordered(modules.flatMap(item => item.workbook_slug === book?.slug && item.draft ? [{ ...item, content: item.draft }] : []));
  const selected = drafts.find(item => item.id === query.module);
  if (query.module && query.module !== 'new' && !selected) notFound();
  const chapterTitles = [...new Set(drafts.map(item => item.content.chapter))];
  const base = book ? '/content-editor?workbook=' + slugSchema.parse(book.slug) : '/content-editor';

  return <>
    <Heading title="Workbook content editor" subtitle="Create workbooks, build modules, and publish each module when it’s ready." />
    {!demo && <p><Link className="text-button" href={contentEditorPath}>Personal Growth Content Manager</Link></p>}
    {!book ? <div className="editor-layout">
      <section className="panel form-panel">
        <h2>Workbooks</h2>
        <ul className="editor-list">{books.map(item => <li key={item.slug}><Link className="text-button" href={'/content-editor?workbook=' + item.slug}>{item.title}{item.sample && ' · Demo'}</Link></li>)}</ul>
      </section>
      <section className="panel form-panel">
        <h2>Create a workbook</h2>
        <StudioForm action={createWorkbook} className="stack">
          <label>Workbook title<input name="title" required maxLength={120} /></label>
          <label>Workbook URL name<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={64} placeholder="my-new-workbook" required /></label>
          <label>Description<textarea name="summary" required maxLength={500} rows={3} /></label>
          <button className="primary">Create workbook</button>
        </StudioForm>
      </section>
    </div> : <>
      <Link className="text-button back" href="/content-editor">All editor workbooks</Link>
      <div className="editor-layout">
        <section className="panel form-panel">
          <h2>{book.title}</h2>
          <p>{book.summary}</p>
          {book.sample && <p className="eyebrow">Demonstration workbook</p>}
          <ul className="editor-list">{drafts.map(item => <li key={item.id}>
            <Link className="text-button" aria-current={selected?.id === item.id ? 'page' : undefined} href={base + '&module=' + item.id}>{item.content.title}</Link>
            <small>{item.revision === 0 ? 'Draft' : item.revision === item.edit_version ? 'Published' : 'Unpublished changes'}</small>
          </li>)}</ul>
          <Link className="primary" href={base + '&module=new'}>New module</Link>
          {drafts.some(item => item.revision > 0) && <p><Link className="text-button" href={'/workbooks/' + book.slug}>Open published workbook</Link></p>}
        </section>
        {query.module && <section className="panel form-panel" aria-labelledby="module-editor-title">
          <h2 id="module-editor-title">{selected ? 'Edit module' : 'Create a module'}</h2>
          {query.saved === '1' && selected && <p role="status" className="feedback">Draft saved.</p>}
          <datalist id="workbook-chapters">{chapterTitles.map(title => <option key={title} value={title} />)}</datalist>
          <ModuleEditor key={(selected?.id ?? 'new') + ':' + (selected?.edit_version ?? 0)}
            slug={book.slug} id={selected?.id ?? null} version={selected?.edit_version ?? 0}
            initial={selected?.content ?? { format: 1, title: '', chapter: '', chapterOrder: 1, order: 1, blocks: [] }} />
          {selected?.edit_version && selected.edit_version !== selected.revision && <section className="editor-preview">
            <h3>Publish module</h3>
            <p className="muted">Publishing uses the last saved draft and makes it visible in the workbook.</p>
            <StudioForm action={publishModule.bind(null, book.slug, selected.id, selected.edit_version)}>
              <button className="primary">Publish saved draft</button>
            </StudioForm>
          </section>}
        </section>}
      </div>
    </>}
  </>;
}
