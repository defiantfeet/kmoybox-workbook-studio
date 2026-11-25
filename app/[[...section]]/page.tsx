import { notFound, redirect } from 'next/navigation';
import { Goals, Journal } from '../../components/personal';
import { workbookLinks } from '../../lib/personal/workbook-links';
import { LockedWorkbook, Purchases } from '../../components/storefront';
import { purchaseHistory } from '../../lib/payments/history';
import { Login } from '../../components/forms';
import { Progress, Workbook, Workbooks } from '../../components/sections';
import { pages, Shell } from '../../components/studio';
import { Dashboard } from '../../components/dashboard';
import { Account } from '../../components/account';
import { ContentEditor } from '../../components/content-editor';
import { WorkbookEngine } from '../../components/workbook-engine';
import { canEditWorkbooks, completedModuleCount, publishedWorkbook, workbookLibrary } from '../../lib/workbooks/repository';
import { dashboardReflection } from '../../lib/becoming/content-data';
import { studioDay } from '../../lib/model';
import { studio } from '../../lib/data';
import { demo, supabase } from '../../lib/session';

export default async function Page({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ confirmation?: string; reset?: string; deleted?: string; reflection?: string; workbook?: string; module?: string; saved?: string; attach?: string; checkout?: string }>;
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
    const query = await searchParams;
    return <Login configured={!!client} failed={query.confirmation === 'failed'} reset={query.reset === 'success'} deleted={query.deleted === '1'} />;
  }
  if (![...pages.map(page => page.key), 'progress', 'library', 'content-editor', 'purchases'].includes(current) || (current === 'dashboard' && section.length)
    || section.length > (current === 'workbooks' ? 2 : 1)) notFound();
  const now = studioDay(new Date());
  const { data, name, displayName, email, client } = await studio(now);
  const query = await searchParams;
  const engineBook = current === 'workbooks' && slug && !data.products.some(product => product.slug === slug)
    ? await publishedWorkbook(slug) : null;
  const [engineLibrary, reflection] = await Promise.all([
    current === 'workbooks' || current === 'library' || current === 'dashboard' && !demo ? workbookLibrary() : [],
    current === 'dashboard' || (current === 'journal' && typeof query.reflection === 'string')
      ? dashboardReflection(client, now, current === 'journal' ? query.reflection : undefined)
      : undefined,
  ]);
  const offer = engineLibrary.find(book => book.slug === slug);
  return <Shell current={current} name={name} sample={demo}>
    {current === 'dashboard' && reflection && <Dashboard name={name} data={data} now={now} engineLibrary={engineLibrary} reflection={reflection} completedModules={await completedModuleCount()} />}
    {current === 'workbooks' && (engineBook ? <WorkbookEngine workbook={engineBook} selected={query.module} />
      : offer && !offer.unlocked ? <LockedWorkbook book={offer} />
      : slug ? <Workbook slug={slug} data={data} /> : <Workbooks data={data} engineLibrary={engineLibrary} />)}
    {current === 'journal' && <Journal data={data} links={await workbookLinks(data, true)} attached={query.attach} reflection={reflection?.prompt} />}
    {current === 'goals' && <Goals data={data} attached={query.attach} links={await workbookLinks(data, false)} />}
    {current === 'account' && <Account displayName={displayName} email={email} sample={demo} canEdit={await canEditWorkbooks()} />}
    {current === 'content-editor' && <ContentEditor query={query} />}
    {current === 'progress' && <Progress data={data} />}
    {current === 'library' && <Workbooks data={data} library engineLibrary={engineLibrary.filter(book => book.owned)} />}
    {current === 'purchases' && <Purchases rows={await purchaseHistory()} returned={query.checkout === 'complete'} />}
  </Shell>;
}
