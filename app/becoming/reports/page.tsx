import { centralRemindersActive } from '../../../lib/becoming/reminder-data';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { GrowthReports } from '../../../components/growth-reports';
import { Heading, Shell } from '../../../components/studio';
import { growthAccount, growthDates } from '../../../lib/becoming/data';
import { addDays } from '../../../lib/becoming/habits';
import { generateGrowthReport, reportHistory, reportReminders, savedGrowthReport } from '../../../lib/becoming/report-data';
import { reportKeys, reportPeriod, type ReportKind } from '../../../lib/becoming/reports';
import { demo } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ searchParams }: {
  searchParams: Promise<{ kind?: string; day?: string; compare?: string; saved?: string; deleted?: string }>;
}) {
  const [{ client, owner, name, timezone }, query] = await Promise.all([growthAccount(), searchParams]);
  const { today } = growthDates(timezone);
  const kind: ReportKind = query.kind === 'monthly' ? 'monthly' : 'weekly';
  const day = z.iso.date().safeParse(query.day);
  const period = reportPeriod(kind, day.success && day.data >= '1900-01-01' && day.data <= today ? day.data : today);
  const [stored, history, reminders, centralized] = await Promise.all([
    savedGrowthReport(client, owner, { kind, start: period.start }),
    reportHistory(client, owner, kind),
    reportReminders(client, owner, today),
    centralRemindersActive(client, owner),
  ]);
  const reportZone = stored?.timezone ?? timezone;
  const currentDay = growthDates(reportZone).today;
  const through = stored?.through ?? (currentDay < period.end ? currentDay : period.end);
  const categories = stored?.categories ?? reportKeys;
  const comparedId = z.uuid().safeParse(query.compare);
  if (query.compare && query.compare !== 'previous' && !comparedId.success) notFound();
  const comparePeriod = query.compare === 'previous' ? reportPeriod(kind, addDays(period.start, -1)) : null;
  const [snapshot, backedComparison] = await Promise.all([
    stored?.snapshot ?? generateGrowthReport(client, owner, kind, period, through, reportZone, categories),
    comparePeriod ? savedGrowthReport(client, owner, { kind, start: comparePeriod.start })
      : comparedId.success ? savedGrowthReport(client, owner, { id: comparedId.data }) : null,
  ]);
  if (comparedId.success && (!backedComparison || backedComparison.kind !== kind || backedComparison.start >= period.start)) notFound();
  const comparison = backedComparison ? {
    start: backedComparison.start, end: backedComparison.end, through: backedComparison.through,
    categories: backedComparison.categories, snapshot: backedComparison.snapshot, saved: true,
  } : comparePeriod ? { ...comparePeriod, through: comparePeriod.end, categories, saved: false,
    snapshot: await generateGrowthReport(client, owner, kind, comparePeriod, comparePeriod.end, reportZone, categories),
  } : null;
  return <Shell current="becoming" name={name} sample={demo}>
    <Link className="text-button growth-back" href="/becoming">Back to Personal Growth</Link>
    <Heading title="Growth Reports" subtitle="Review your week or month, reflect in your own words, and save a private copy." />
    <GrowthReports key={kind + period.start + (stored?.revision ?? '')} kind={kind} period={period} through={through}
      timezone={reportZone} today={today} history={history} reminders={reminders} snapshot={snapshot} stored={stored}
      comparison={comparison} centralized={centralized} preview={demo} saved={query.saved === '1' && Boolean(stored)} deleted={query.deleted === '1'} />
  </Shell>;
}
