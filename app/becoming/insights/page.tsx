import Link from 'next/link';
import { GrowthInsights } from '../../../components/growth-insights';
import { Heading, Shell } from '../../../components/studio';
import { growthAccount, growthDates } from '../../../lib/becoming/data';
import { insightPreferences, personalInsights } from '../../../lib/becoming/insight-data';
import { insightsRange } from '../../../lib/becoming/insights';
import { demo } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export default async function InsightsPage({ searchParams }: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const [{ client, owner, name, timezone }, query] = await Promise.all([growthAccount(), searchParams]);
  const { today, monday } = growthDates(timezone);
  const range = insightsRange(query, today, monday);
  const hidden = await insightPreferences(client, owner);
  const report = await personalInsights(client, owner, timezone, today, range, hidden);
  return <Shell current="becoming" name={name} sample={demo}>
    <Link className="text-button growth-back" href="/becoming">Back to Personal Growth</Link>
    <Heading title="Personal Growth Insights" subtitle="Review what you recorded and choose which patterns to explore." />
    <GrowthInsights report={report} hidden={hidden} range={range} today={today} timezone={timezone} preview={demo} />
  </Shell>;
}
