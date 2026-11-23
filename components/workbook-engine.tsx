import { studioPath } from '../lib/studio-path';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Download } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { saveModuleResponses } from '../lib/workbooks/actions';
import type { publishedWorkbook } from '../lib/workbooks/repository';
import { StudioForm } from './forms';
import { Heading, Meter } from './studio';
import { WorkbookBlocks } from './workbook-blocks';

type Workbook = NonNullable<Awaited<ReturnType<typeof publishedWorkbook>>>;

export function WorkbookEngine({ workbook, selected }: { workbook: Workbook; selected?: string }) {
  const { book, modules } = workbook;
  const resume = [...modules].filter(item => !item.completed && item.updatedAt && Object.keys(item.answers).length)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
    ?? modules.find(item => !item.completed) ?? modules[0];
  if (!selected) redirect('/workbooks/' + book.slug + '?module=' + resume.id);
  const active = modules.find(item => item.id === selected);
  if (!active) notFound();
  const chapterGroups = Map.groupBy(modules, item => item.content.chapter);
  const finished = modules.filter(item => item.completed).length;
  const href = '/workbooks/' + book.slug;
  const activeIndex = modules.findIndex(item => item.id === active.id);
  const previous = modules[activeIndex - 1];
  const next = modules[activeIndex + 1];

  return <>
    <Link href="/workbooks" className="text-button back"><ArrowLeft size={16} aria-hidden /> All workbooks</Link>
    {book.sample && <p className="eyebrow workbook-sample">DEMONSTRATION WORKBOOK</p>}
    <Heading title={book.title} subtitle={book.summary} />
    <div className="panel progress-row">
      <p>{finished} of {modules.length} modules complete</p>
      <Meter label="Module completion" percent={Math.round(finished / modules.length * 100)} />
      <a className="text-button" href={studioPath('/workbook-pdf/' + book.slug)}><Download size={16} aria-hidden /> Download my responses (PDF)</a>
    </div>
    <div className="module-layout">
      <nav className="panel module-outline" aria-label="Workbook chapters">
        {Array.from(chapterGroups, ([chapter, entries]) => <div key={chapter}>
          <h2>{chapter}</h2>
          <ul>{entries.map(item => <li key={item.id}><Link aria-current={item.id === active.id ? 'page' : undefined} href={href + '?module=' + item.id}>
            {item.content.title}<small>{item.completed ? 'Complete' : Object.keys(item.answers).length ? 'In progress' : 'Ready to start'}</small>
          </Link></li>)}</ul>
        </div>)}
      </nav>
      <section className="panel form-panel module-reader" aria-labelledby="module-title">
        <p className="eyebrow">{active.content.chapter}</p>
        <h2 id="module-title">{active.content.title}</h2>
        {active.completed && <p className="module-complete">Module complete</p>}
        <StudioForm key={active.id + ':' + active.revision} action={saveModuleResponses.bind(null, book.slug, active.id, active.revision)} className="stack">
          <WorkbookBlocks content={active.content} answers={active.answers} />
          <div className="actions">
            <button type="submit" className="secondary" name="intent" value="save">Save responses</button>
            <button type="submit" className="primary" name="intent" value="complete">{active.completed ? 'Save and keep complete' : 'Complete module'}</button>
          </div>
        </StudioForm>
        <div className="module-travel">
          {previous && <Link className="text-button" href={href + '?module=' + previous.id}><ArrowLeft size={15} aria-hidden /> Previous module</Link>}
          {next && <Link className="text-button" href={href + '?module=' + next.id}>Next module <ArrowRight size={15} aria-hidden /></Link>}
        </div>
      </section>
    </div>
  </>;
}
