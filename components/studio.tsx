import Link from 'next/link';
import { ArrowDownRight, ArrowRight, BookOpen, ChartNoAxesColumn, Feather, Heart, LayoutDashboard, LockKeyhole, LogOut, ShoppingBag, Sparkles, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { signOut } from '../lib/actions';
import { progress, type Product, type StudioData } from '../lib/model';

export const pages = [
  { key: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { key: 'workbooks', title: 'Workbooks', icon: BookOpen, href: '/workbooks' },
  { key: 'journal', title: 'Journal', icon: Feather, href: '/journal' },
  { key: 'goals', title: 'Goals', icon: Target, href: '/goals' },
  { key: 'progress', title: 'Progress', icon: ChartNoAxesColumn, href: '/progress' },
  { key: 'library', title: 'My Library', icon: ShoppingBag, href: '/library' },
];

export function Shell({ current, name, sample, children }: { current: string; name: string; sample: boolean; children: ReactNode }) {
  return <div className="shell">
    <a className="skip" href="#main">Skip to content</a>
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-icon"><Sparkles size={20} aria-hidden /></span><span><strong>KMOYBOX</strong><small>WORKBOOK STUDIO</small></span></Link>
      <nav aria-label="Studio navigation">
        {pages.map(({ key, title, icon: Icon, href }) => <Link key={key} aria-current={key === current ? 'page' : undefined} href={href}><Icon aria-hidden size={18} strokeWidth={1.7} />{title}</Link>)}
      </nav>
      <div className="side-bottom"><p>Keep Me Out<br />of Your Box.</p><span>A SPACE OF YOUR OWN</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>{pages.find(page => page.key === current)?.title}</span>
        <div className="account">{sample ? <small>Sample workspace</small> : <form action={signOut}><button className="text-button" aria-label="Sign out" title="Sign out"><LogOut size={17} aria-hidden /></button></form>}<span className="avatar" aria-hidden>{name[0]?.toUpperCase() || 'K'}</span></div>
      </header>
      <main id="main" tabIndex={-1} className="content">{children}</main>
    </div>
  </div>;
}

export function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="page-intro"><h1>{title}</h1><p>{subtitle}</p></header>;
}

export function Meter({ percent, label }: { percent: number; label: string }) {
  return <div className="meter-line">
    <div role="progressbar" className="meter" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: percent + '%' }} /></div>
    <span>{percent}%</span>
  </div>;
}

export function titleTone(slug: string) {
  return slug === 'the-boundaries-edit' ? 'sand' : slug === 'becoming-her' ? 'lilac' : 'rose';
}

export function ProductCard({ product, data }: { product: Product; data: StudioData }) {
  const open = product.free || data.purchased.includes(product.slug);
  const stats = progress(product.slug, data.prompts, data.answers);
  return <article className="panel product">
    <div className={'cover ' + titleTone(product.slug)}><BookOpen size={27} strokeWidth={1.25} aria-hidden /></div>
    <div className="product-body">
      <h2>{product.title}</h2><p>{product.summary}</p>
      {open ? <><Meter percent={stats.percent} label={product.title + ' completion'} />
        <Link className="text-button" href={'/workbooks/' + product.slug}>{stats.done ? 'Open workbook' : 'Start workbook'} <ArrowRight size={15} aria-hidden /></Link></>
        : <span className="locked"><LockKeyhole size={15} aria-hidden /> Purchase required</span>}
    </div>
  </article>;
}

export function Dashboard({ name, data }: { name: string; data: StudioData }) {
  const available = data.products.filter(product => product.free || data.purchased.includes(product.slug));
  const ongoing = available.find(product => {
    const stats = progress(product.slug, data.prompts, data.answers);
    return stats.done > 0 && stats.done < stats.total;
  }) ?? available[0];
  const stats = ongoing ? progress(ongoing.slug, data.prompts, data.answers) : null;
  const completedGoals = data.goals.filter(goal => goal.completed).length;
  const metrics = [
    { title: 'Exercises completed', amount: data.prompts.filter(prompt => data.answers.some(answer => answer.prompt_id === prompt.id && answer.completed)).length, icon: BookOpen, tone: 'rose' },
    { title: 'Journal entries', amount: data.journal.length, icon: Feather, tone: 'sand' },
    { title: 'Goals completed', amount: completedGoals, icon: Target, tone: 'lilac' },
    { title: 'Products owned', amount: data.purchased.length, icon: ShoppingBag, tone: 'peach' },
  ];
  return <>
    <Heading title={name ? 'Welcome back, ' + name + '.' : 'Welcome to your studio.'} subtitle="Take a breath. There’s room here for all of who you’re becoming." />
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-content"><p className="eyebrow"><Sparkles size={14} aria-hidden /> YOUR PERSONAL GROWTH STUDIO</p>
      <h2 id="hero-title">Make space<br />to <em>become.</em></h2>
      <p>A little reflection goes a long way.</p>
      <Link className="primary" href="/workbooks">Explore workbooks <ArrowRight size={16} aria-hidden /></Link></div>
    </section>
    <section aria-labelledby="overview-title" className="dashboard-section">
      <div className="section-head"><h2 id="overview-title">Your growth at a glance</h2><Link className="text-button" href="/progress">View progress <ArrowRight size={15} aria-hidden /></Link></div>
      <div className="metrics">{metrics.map(({ title, amount, icon: Icon, tone }) => <article className="panel metric" key={title}><span className={'metric-icon ' + tone}><Icon size={18} strokeWidth={1.7} aria-hidden /></span><strong>{amount}</strong><p>{title}</p></article>)}</div>
    </section>
    <div className="dashboard-columns dashboard-section">
      <section aria-labelledby="continue-title">
        <div className="section-head"><h2 id="continue-title">Continue your journey</h2></div>
        {ongoing && stats ? <article className="panel current-workbook">
          <span className={'mini-cover ' + titleTone(ongoing.slug)}><BookOpen size={27} strokeWidth={1.25} aria-hidden /></span>
          <div><p className="eyebrow">GUIDED WORKBOOK</p><h3>{ongoing.title}</h3><Meter percent={stats.percent} label={ongoing.title + ' completion'} /></div>
          <Link className="circle-link" aria-label={'Open ' + ongoing.title} href={'/workbooks/' + ongoing.slug}><ArrowRight size={19} aria-hidden /></Link>
        </article> : <p className="panel empty">Workbooks will appear here when available.</p>}
      </section>
      <section aria-labelledby="reflection-title">
        <div className="section-head"><h2 id="reflection-title">A moment to reflect</h2></div>
        <article className="panel reflection"><Heart size={19} strokeWidth={1.6} aria-hidden /><p>What would it look like to give yourself a little more space today?</p><Link className="text-button" href="/journal#new-entry">Write in your journal <ArrowDownRight size={16} aria-hidden /></Link></article>
      </section>
    </div>
  </>;
}
