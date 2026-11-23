import Link from 'next/link';
import { ArrowRight, BookOpen, Check, Feather, ShoppingBag, Sparkles, Target } from 'lucide-react';
import { updateWeeklyGoal } from '../lib/actions';
import { currentWeek, dailyReflection, dateKey, progress, type StudioData } from '../lib/model';
import { StudioForm } from './forms';
import { Meter, ProductCard, WorkbookCover } from './studio';

export function Dashboard({ name, data, now, completedModules }: { name: string; data: StudioData; now: Date; completedModules: number }) {
  const available = data.products.filter(product => product.free || data.purchased.includes(product.slug));
  const workbooks = available.map(product => ({
    product,
    ...progress(product.slug, data.prompts, data.answers),
  }));
  const continuation = workbooks.find(book => book.done > 0 && book.done < book.total)
    ?? workbooks.find(book => book.done < book.total);
  const completedAnswers = new Set(data.answers.filter(answer => answer.completed).map(answer => answer.prompt_id));
  const nextExercise = continuation && data.prompts.find(prompt =>
    prompt.product_slug === continuation.product.slug && !completedAnswers.has(prompt.id));
  const { start, end } = currentWeek(now);
  const weeklyGoals = data.goals.filter(goal => goal.target_date && goal.target_date >= dateKey(start) && goal.target_date <= dateKey(end));
  const milestones = data.milestones ?? [];
  const weekCompleted = weeklyGoals.filter(goal => goal.completed).length;
  const weekLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).formatRange(start, end);
  const metrics = [
    { title: 'Exercises completed', amount: workbooks.reduce((total, book) => total + book.done, 0), icon: BookOpen, tone: 'rose' },
    { title: 'Journal entries', amount: data.journal.length, icon: Feather, tone: 'sand' },
    { title: 'Goals completed', amount: data.goals.filter(goal => goal.completed).length, icon: Target, tone: 'lilac' },
    { title: 'Products owned', amount: data.purchased.length, icon: ShoppingBag, tone: 'peach' },
  ];

  return <>
    <header className="hero dashboard-hero">
      <div className="hero-content">
        <h1>{name ? <>Welcome back,<br /><em>{name}.</em></> : <>Welcome to<br /><em>your studio.</em></>}</h1>
        <p>Take a breath. There’s room here for all of who you’re becoming.</p>
      </div>
    </header>

    <div className="dashboard-grid dashboard-section">
      <div className="dashboard-main">
        <section aria-labelledby="continue-title">
          <div className="section-head"><h2 id="continue-title">Continue My Workbook</h2></div>
          {continuation ? <article className="panel continue-card">
            <WorkbookCover slug={continuation.product.slug} compact />
            <div className="continue-copy">
              <h3>{continuation.product.title}</h3>
              <p>{continuation.done} of {continuation.total} exercises complete</p>
              <Meter percent={continuation.percent} label={continuation.product.title + ' completion'} />
              <Link className="primary" href={'/workbooks/' + continuation.product.slug + (nextExercise ? '#exercise-' + nextExercise.id : '')}>
                {continuation.done ? 'Continue workbook' : 'Start workbook'} <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          </article> : <p className="panel empty">You’re all caught up. <Link href="/workbooks">Browse workbooks</Link></p>}
        </section>

        <section aria-labelledby="library-title" className="dashboard-section">
          <div className="section-head"><h2 id="library-title">Workbook Library</h2><Link className="text-button" href="/workbooks">Browse all <ArrowRight size={15} aria-hidden /></Link></div>
          {available.length ? <div className="dashboard-library">{available.map(product => <ProductCard key={product.slug} product={product} data={data} compact />)}</div>
            : <p className="panel empty">Your available workbooks will appear here.</p>}
        </section>
      </div>

      <div className="dashboard-aside">
        <section aria-labelledby="reflection-title">
          <div className="section-head"><h2 id="reflection-title">Daily Reflection</h2></div>
          <article className="panel reflection">
            <Sparkles size={19} strokeWidth={1.6} aria-hidden />
            <p>{dailyReflection(now)}</p>
            <Link className="text-button" href="/journal?reflection=today#new-entry">Reflect in your journal <ArrowRight size={15} aria-hidden /></Link>
          </article>
        </section>

        <section aria-labelledby="week-title" className="dashboard-section">
          <div className="section-head"><h2 id="week-title">Weekly Goals</h2><Link className="text-button" href="/goals">View goals <ArrowRight size={15} aria-hidden /></Link></div>
          <div className="panel weekly-card">
            <div className="week-meta"><span>{weekLabel}</span><span>{weekCompleted} of {weeklyGoals.length} complete</span></div>
            {weeklyGoals.length ? <StudioForm action={updateWeeklyGoal}>
              <ul className="weekly-list">
                {weeklyGoals.map(goal => <li key={goal.id}>
                  <button type="submit" role="checkbox" aria-checked={goal.completed} name="goal" value={goal.id + ':' + !goal.completed}>
                    <span className="check-mark" aria-hidden>{goal.completed && <Check size={13} strokeWidth={2.5} />}</span>
                    <span>{goal.title}</span>
                  </button>
                </li>)}
              </ul>
            </StudioForm> : <p className="muted">Set a goal with a target date this week to see it here.</p>}
          </div>
        </section>
      </div>
    </div>

    <section aria-labelledby="overview-title" className="dashboard-section">
      <div className="section-head"><h2 id="overview-title">Progress Overview</h2><Link className="text-button" href="/progress">View progress <ArrowRight size={15} aria-hidden /></Link></div>
      {(milestones.length > 0 || completedModules > 0) && <div className="panel dashboard-milestones">
        {milestones.length > 0 && <p>{milestones.filter(item => item.completed).length} of {milestones.length} milestones complete</p>}
        {completedModules > 0 && <p>{completedModules} workbook {completedModules === 1 ? 'module' : 'modules'} complete</p>}
      </div>}
      <div className="metrics">{metrics.map(({ title, amount, icon: Icon, tone }) => <article className="panel metric" key={title}><span className={'metric-icon ' + tone}><Icon size={18} strokeWidth={1.7} aria-hidden /></span><strong>{amount}</strong><p>{title}</p></article>)}</div>
    </section>
  </>;
}
