import { notFound, redirect } from 'next/navigation';
import { Goals, Journal } from '../../components/personal';
import { workbookLinks } from '../../lib/personal/workbook-links';
import { Login } from '../../components/forms';
import { Progress, Workbook, Workbooks } from '../../components/sections';
import { pages, Shell } from '../../components/studio';
import { Dashboard } from '../../components/dashboard';
import { Account } from '../../components/account';
import { ContentEditor } from '../../components/content-editor';
import { WorkbookEngine } from '../../components/workbook-engine';
import { canEditWorkbooks, completedModuleCount, publishedWorkbook, workbookLibrary } from '../../lib/workbooks/repository';
import { dailyReflection, studioDay } from '../../lib/model';
import { studio } from '../../lib/data';
import { demo, supabase } from '../../lib/session';

export default async function Page({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ confirmation?: string; reflection?: string; workbook?: string; module?: string; saved?: string; attach?: string }>;
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
  if (![...pages.map(page => page.key), 'progress', 'library', 'content-editor'].includes(current) || (current === 'dashboard' && section.length)
    || section.length > (current === 'workbooks' ? 2 : 1)) notFound();
  const now = studioDay(new Date());
  const { data, name, displayName, email } = await studio(now);
  const query = await searchParams;
  const engineBook = current === 'workbooks' && slug && !data.products.some(product => product.slug === slug)
    ? await publishedWorkbook(slug) : null;
  const engineLibrary = current === 'workbooks' && !slug ? await workbookLibrary() : [];
  return <Shell current={current} name={name} sample={demo}>
    {current === 'dashboard' && <Dashboard name={name} data={data} now={now} completedModules={await completedModuleCount()} />}
    {current === 'workbooks' && (engineBook ? <WorkbookEngine workbook={engineBook} selected={query.module} />
      : slug ? <Workbook slug={slug} data={data} /> : <Workbooks data={data} engineLibrary={engineLibrary} />)}
    {current === 'journal' && <Journal data={data} links={await workbookLinks(data, true)} attached={query.attach} reflection={query.reflection === 'today' ? dailyReflection(now) : undefined} />}
    {current === 'goals' && <Goals data={data} attached={query.attach} links={await workbookLinks(data, false)} />}
    {current === 'account' && <Account displayName={displayName} email={email} sample={demo} canEdit={await canEditWorkbooks()} />}
    {current === 'content-editor' && <ContentEditor query={query} />}
    {current === 'progress' && <Progress data={data} />}
    {current === 'library' && <Workbooks data={data} library />}
  </Shell>;
}
