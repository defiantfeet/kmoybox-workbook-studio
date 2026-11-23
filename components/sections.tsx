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
        <div className="actions">
          {answer && <Link className="text-button" href={'/journal?attach=legacy:' + prompt.id + '#new-entry'}>Reflect on this response</Link>}
          <Link className="text-button" href={'/goals?attach=legacy:' + prompt.id}>Set a related goal</Link>
        </div>
      </section>;
    })}</div>
  </>;
}

export function Progress({ data }: { data: StudioData }) {
  const milestones = data.milestones ?? [];
  const completedMilestones = milestones.filter(item => item.completed).length;
  const complete = data.goals.filter(goal => goal.completed).length;
  const products = data.products.filter(product => product.free || data.purchased.includes(product.slug));
  return <>
    <Heading title="Your progress" subtitle="See how far you’ve come across your workbooks and goals." />
    <div className="stack">
      <section className="panel form-panel"><h2>Goals</h2><p>{complete} of {data.goals.length} completed</p><Meter percent={data.goals.length ? Math.round(100 * complete / data.goals.length) : 0} label="Goal completion" /></section>
      {milestones.length > 0 && <section className="panel form-panel"><h2>Milestones</h2>
        <p>{completedMilestones} of {milestones.length} milestones complete</p>
        <Meter percent={Math.round(completedMilestones / milestones.length * 100)} label="Milestone completion" />
        <Link href="/goals" className="text-button">View goal history</Link>
      </section>}
      {products.map(product => {
        const stats = progress(product.slug, data.prompts, data.answers);
        return <section className="panel form-panel" key={product.slug}><h2><Link href={'/workbooks/' + product.slug}>{product.title}</Link></h2><p>{stats.done} of {stats.total} exercises completed</p><Meter percent={stats.percent} label={product.title + ' completion'} /></section>;
      })}
    </div>
  </>;
}
