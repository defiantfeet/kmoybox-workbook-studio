import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { save } from '../lib/actions';
import { progress, type StudioData } from '../lib/model';
import type { WorkbookRecord } from '../lib/workbooks/schema';
import { StudioForm } from './forms';
import { Heading, Meter, ProductCard } from './studio';

export function Workbooks({ data, library = false, engineLibrary = [] }: { data: StudioData; library?: boolean; engineLibrary?: WorkbookRecord[] }) {
  const products = library ? data.products.filter(product => data.purchased.includes(product.slug)) : data.products;
  return <>
    <Heading title={library ? 'My Library' : 'Workbooks'} subtitle={library ? 'Revisit the digital products you own.' : 'Guided exercises for the things you’re working through.'} />
    {engineLibrary.length > 0 && <section aria-label="Interactive workbooks" className="product-grid engine-library">
      {engineLibrary.map(book => <article key={book.slug} className="panel form-panel">
        {book.sample && <p className="eyebrow">Demonstration workbook</p>}
        <h2>{book.title}</h2>
        <p>{book.summary}</p>
        <Link className="text-button" href={'/workbooks/' + book.slug}>Open {book.title}</Link>
      </article>)}
    </section>}
    {products.length ? <div className="product-grid">{products.map(product => <ProductCard key={product.slug} product={product} data={data} />)}</div>
      : !engineLibrary.length && <p className="panel empty">{library ? 'Purchased products will appear here.' : 'Workbooks will appear here when available.'} <Link href="/workbooks">Browse workbooks</Link></p>}
  </>;
}

export function Workbook({ data, slug }: { data: StudioData; slug: string }) {
  const product = data.products.find(item => item.slug === slug);
  if (!product || (!product.free && !data.purchased.includes(slug))) notFound();
  const exercises = data.prompts.filter(prompt => prompt.product_slug === slug);
  const stats = progress(slug, data.prompts, data.answers);
  return <>
    <Link href="/workbooks" className="text-button back"><ArrowLeft size={16} aria-hidden /> All workbooks</Link>
    <Heading title={product.title} subtitle={product.summary} />
    <div className="panel progress-row"><p>{stats.done} of {stats.total} exercises completed</p><Meter percent={stats.percent} label="Workbook completion" /></div>
    <div className="stack">{exercises.map(prompt => {
      const answer = data.answers.find(item => item.prompt_id === prompt.id);
      return <section key={prompt.id} id={'exercise-' + prompt.id} className="panel form-panel">
        <p className="eyebrow">EXERCISE {prompt.position}{answer?.completed ? ' · COMPLETED' : ''}</p>
        <h2>{prompt.title}</h2>
        <StudioForm action={save.bind(null, 'workbook')} className="stack">
          <input type="hidden" name="id" value={prompt.id} />
          <label>{prompt.question}<textarea name="body" rows={4} required maxLength={10000} defaultValue={answer?.body} /></label>
          <div className="actions"><button className="primary" name="intent" value="complete">{answer?.completed ? 'Update completed response' : 'Mark complete'}</button><button className="secondary" name="intent" value="draft">Save as draft</button></div>
        </StudioForm>
      </section>;
    })}</div>
  </>;
}

export function Journal({ data, reflection }: { data: StudioData; reflection?: string }) {
  return <>
    <Heading title="Your journal" subtitle="A private place to put your thoughts into words." />
    <section id="new-entry" className="panel form-panel">
      <h2>New entry</h2>
      {reflection && <p className="journal-prompt">{reflection}</p>}
      <StudioForm action={save.bind(null, 'journal')} className="stack">
        <label>Title<input name="title" required maxLength={140} /></label>
        <label>What’s on your mind?<textarea name="body" rows={5} required maxLength={10000} /></label>
        <button className="primary">Save entry</button>
      </StudioForm>
    </section>
    <section className="dashboard-section stack" aria-labelledby="entries-title">
      <h2 id="entries-title">Past entries</h2>
      {!data.journal.length && <p className="panel empty">Your saved entries will appear here.</p>}
      {data.journal.map(entry => <details className="panel form-panel" key={entry.id}>
        <summary><strong>{entry.title}</strong> <time dateTime={entry.created_at}>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(entry.created_at))}</time></summary>
        <StudioForm action={save.bind(null, 'journal')} className="stack edit">
          <input type="hidden" name="id" value={entry.id} />
          <label>Title<input name="title" defaultValue={entry.title} required maxLength={140} /></label>
          <label>Entry<textarea name="body" rows={5} defaultValue={entry.body} required maxLength={10000} /></label>
          <div className="actions"><button className="primary">Update entry</button><button name="intent" value="delete" className="secondary" formNoValidate>Delete entry</button></div>
        </StudioForm>
      </details>)}
    </section>
  </>;
}

export function Goals({ data }: { data: StudioData }) {
  return <>
    <Heading title="Your goals" subtitle="Choose what matters to you and give it a next step." />
    <section className="panel form-panel">
      <h2>Set a goal</h2>
      <StudioForm action={save.bind(null, 'goal')} className="stack">
        <label>Goal<input name="title" required maxLength={140} /></label>
        <label>Target date (optional)<input name="date" type="date" /></label>
        <button className="primary">Add goal</button>
      </StudioForm>
    </section>
    <section className="dashboard-section stack" aria-labelledby="saved-goals-title">
      <h2 id="saved-goals-title">Saved goals</h2>
      {!data.goals.length && <p className="panel empty">Your goals will appear here.</p>}
      {data.goals.map(goal => <details className="panel form-panel" key={goal.id}>
        <summary><strong>{goal.title}</strong> <span>{goal.completed ? 'Completed' : 'In progress'}{goal.target_date ? ' · ' + goal.target_date : ''}</span></summary>
        <StudioForm action={save.bind(null, 'goal')} className="stack edit">
          <input type="hidden" name="id" value={goal.id} />
          <input type="hidden" name="completed" value={String(!goal.completed)} />
          <label>Goal<input name="title" defaultValue={goal.title} required maxLength={140} /></label>
          <label>Target date (optional)<input name="date" type="date" defaultValue={goal.target_date ?? ''} /></label>
          <div className="actions"><button className="primary">Update goal</button><button name="intent" value="toggle" className="secondary" formNoValidate>{goal.completed ? 'Reopen goal' : 'Complete goal'}</button><button name="intent" value="delete" className="secondary" formNoValidate>Delete goal</button></div>
        </StudioForm>
      </details>)}
    </section>
  </>;
}

export function Progress({ data }: { data: StudioData }) {
  const complete = data.goals.filter(goal => goal.completed).length;
  const products = data.products.filter(product => product.free || data.purchased.includes(product.slug));
  return <>
    <Heading title="Your progress" subtitle="See how far you’ve come across your workbooks and goals." />
    <div className="stack">
      <section className="panel form-panel"><h2>Goals</h2><p>{complete} of {data.goals.length} completed</p><Meter percent={data.goals.length ? Math.round(100 * complete / data.goals.length) : 0} label="Goal completion" /></section>
      {products.map(product => {
        const stats = progress(product.slug, data.prompts, data.answers);
        return <section className="panel form-panel" key={product.slug}><h2><Link href={'/workbooks/' + product.slug}>{product.title}</Link></h2><p>{stats.done} of {stats.total} exercises completed</p><Meter percent={stats.percent} label={product.title + ' completion'} /></section>;
      })}
    </div>
  </>;
}
