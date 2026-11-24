import { GrowthContentLibrary } from '../../components/growth-content-copy';
import { contentFor } from '../../lib/becoming/content-catalog';
import { publishedGrowthContent } from '../../lib/becoming/content-data';
import { centralRemindersActive } from '../../lib/becoming/reminder-data';
import Link from 'next/link';
import { reportReminders } from '../../lib/becoming/report-data';
import { OnboardingSummary } from '../../components/starting-plan';
import { loadOnboarding } from '../../lib/becoming/onboarding-data';
import { Becoming } from '../../components/becoming';
import { Shell } from '../../components/studio';
import { growthAccount, growthDates, growthOverview } from '../../lib/becoming/data';
import { demo } from '../../lib/session';

export const dynamic = 'force-dynamic';

export default async function BecomingPage() {
  const { client, owner, name, timezone } = await growthAccount();
  const [overview, onboarding, reports, centralized, published] = await Promise.all([growthOverview(client, owner, timezone), loadOnboarding(client, owner),
    reportReminders(client, owner, growthDates(timezone).today), centralRemindersActive(client, owner), publishedGrowthContent(client)]);
  return <Shell current="becoming" name={name} sample={demo}>
    <Becoming name={name} overview={overview} timezone={timezone} preview={demo} centralized={centralized} published={published} onboarding={<>
      <OnboardingSummary onboarding={onboarding} />
      {!centralized && reports.available.map(report => <section key={report.kind} className="panel growth-panel" aria-label="Studio report reminder">
        <p role="status">A Studio report is available.</p>
        <Link className="text-button" href={'/becoming/reports?kind=' + report.kind + '&day=' + report.day}>Open {report.kind} report</Link>
      </section>)}
    </>} />
    <GrowthContentLibrary items={contentFor(published, 'dashboard')} />
  </Shell>;
}
