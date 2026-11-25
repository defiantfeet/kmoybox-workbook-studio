import Link from 'next/link';
import { GrowthOnboarding } from '../../../components/growth-onboarding';
import { Heading, Shell } from '../../../components/studio';
import { growthAccount } from '../../../lib/becoming/data';
import { loadOnboarding } from '../../../lib/becoming/onboarding-data';
import { demo } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const { client, owner, name, timezone } = await growthAccount();
  const onboarding = await loadOnboarding(client, owner);
  return <Shell current="becoming" name={name} sample={demo}>
    <Link className="text-button growth-back" href="/becoming">Back to Personal Growth</Link>
    <Heading title="Personalize The Becoming Studio" subtitle="Build an optional starting plan around what matters to you." />
    <GrowthOnboarding onboarding={onboarding} timezone={timezone} preview={demo} />
  </Shell>;
}
