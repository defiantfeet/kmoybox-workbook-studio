import { studioPath } from '../lib/studio-path';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen, Feather, LayoutDashboard, LockKeyhole, Sparkles, Target, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { progress, type Product, type StudioData } from '../lib/model';

export const pages = [
  { key: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { key: 'workbooks', title: 'Workbooks', icon: BookOpen, href: '/workbooks' },
  { key: 'journal', title: 'Journal', icon: Feather, href: '/journal' },
  { key: 'goals', title: 'Goals', icon: Target, href: '/goals' },
  { key: 'account', title: 'Account', icon: UserRound, href: '/account' },
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
      <header className="topbar"><span>{pages.find(page => page.key === current)?.title ?? (current === 'progress' ? 'Progress' : current === 'content-editor' ? 'Content Editor' : current === 'purchases' ? 'Purchase history' : 'My Library')}</span>
        <div className="account">{sample && <small>Sample content</small>}<Link href="/account" className="avatar" aria-label="Open account">{name[0]?.toUpperCase() || 'K'}</Link></div>
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

const covers: Record<string, { image: string; tone: string }> = {
  'finding-my-voice': { image: '/covers/finding-my-voice.webp', tone: 'rose' },
  'the-boundaries-edit': { image: '/covers/the-boundaries-edit.webp', tone: 'sand' },
  'becoming-her': { image: '/covers/becoming-her.webp', tone: 'lilac' },
};

export function WorkbookCover({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const cover = Object.hasOwn(covers, slug) ? covers[slug] : undefined;
  return <div className={`cover ${compact ? 'cover-compact' : ''} ${cover?.tone ?? 'rose'}`}>
    {cover ? <Image src={studioPath(cover.image)} alt="" fill sizes={compact ? '106px' : '(max-width: 480px) 85vw, 300px'} /> : <BookOpen size={28} aria-hidden />}
  </div>;
}

export function ProductCard({ product, data, compact = false }: { product: Product; data: StudioData; compact?: boolean }) {
  const Title = compact ? 'h3' : 'h2';
  const open = product.free || data.purchased.includes(product.slug);
  const stats = progress(product.slug, data.prompts, data.answers);
  const action = stats.done ? 'Open' : 'Start';
  return <article className="panel product">
    <WorkbookCover slug={product.slug} />
    <div className="product-body">
      <Title>{product.title}</Title>{!compact && <p>{product.summary}</p>}
      {open ? <><Meter percent={stats.percent} label={product.title + ' completion'} />
        <Link className="text-button" href={'/workbooks/' + product.slug} aria-label={action + (!compact ? ' workbook: ' : ' ') + product.title}>{action}{!compact && ' workbook'} <ArrowRight size={15} aria-hidden /></Link></>
        : <span className="locked"><LockKeyhole size={15} aria-hidden /> Purchase required</span>}
    </div>
  </article>;
}
