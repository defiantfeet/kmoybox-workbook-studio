import { notFound, redirect } from 'next/navigation';
import { Login } from '../../components/forms';
import { Goals, Journal, Progress, Workbook, Workbooks } from '../../components/sections';
import { Dashboard, pages, Shell } from '../../components/studio';
import { studio } from '../../lib/data';
import { demo, supabase } from '../../lib/session';

export default async function Page({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ confirmation?: string }>;
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
  if (!pages.some(page => page.key === current) || (current === 'dashboard' && section.length)
    || section.length > (current === 'workbooks' ? 2 : 1)) notFound();
  const { data, name } = await studio();
  return <Shell current={current} name={name} sample={demo}>
    {current === 'dashboard' && <Dashboard name={name} data={data} />}
    {current === 'workbooks' && (slug ? <Workbook slug={slug} data={data} /> : <Workbooks data={data} />)}
    {current === 'journal' && <Journal data={data} />}
    {current === 'goals' && <Goals data={data} />}
    {current === 'progress' && <Progress data={data} />}
    {current === 'library' && <Workbooks data={data} library />}
  </Shell>;
}
