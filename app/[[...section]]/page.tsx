import { notFound, redirect } from 'next/navigation';
import { Login } from '../../components/forms';
import { Goals, Journal, Progress, Workbook, Workbooks } from '../../components/sections';
import { pages, Shell } from '../../components/studio';
import { Dashboard } from '../../components/dashboard';
import { Account } from '../../components/account';
import { dailyReflection, studioDay } from '../../lib/model';
import { studio } from '../../lib/data';
import { demo, supabase } from '../../lib/session';

export default async function Page({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ confirmation?: string; reflection?: string }>;
}) {
  const { section = [] } = await params;
  const [current = 'dashboard', slug] = section;
  if (current === 'login' && section.length === 1) {
    if (demo) redirect('/');
    const client = await supabase();
    if (client) {
      const { data } = await client.auth.getUser();
      if (data.user) redirect('/');
    }
    return <Login configured={!!client} failed={(await searchParams).confirmation === 'failed'} />;
  }
  if (![...pages.map(page => page.key), 'progress', 'library'].includes(current) || (current === 'dashboard' && section.length)
    || section.length > (current === 'workbooks' ? 2 : 1)) notFound();
  const now = studioDay(new Date());
  const { data, name, displayName, email } = await studio(now);
  return <Shell current={current} name={name} sample={demo}>
    {current === 'dashboard' && <Dashboard name={name} data={data} now={now} />}
    {current === 'workbooks' && (slug ? <Workbook slug={slug} data={data} /> : <Workbooks data={data} />)}
    {current === 'journal' && <Journal data={data} reflection={(await searchParams).reflection === 'today' ? dailyReflection(now) : undefined} />}
    {current === 'goals' && <Goals data={data} />}
    {current === 'account' && <Account displayName={displayName} email={email} sample={demo} />}
    {current === 'progress' && <Progress data={data} />}
    {current === 'library' && <Workbooks data={data} library />}
  </Shell>;
}
