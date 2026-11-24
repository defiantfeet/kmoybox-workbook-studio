import Link from 'next/link';
import { onboardingPath, startingPlan, type OnboardingPreferences } from '../lib/becoming/onboarding';
import type { loadOnboarding } from '../lib/becoming/onboarding-data';

export function StartingTools({ preferences }: { preferences: OnboardingPreferences }) {
  const tools = startingPlan(preferences);
  if (!tools.length) return <p className="muted">Choose a topic or add a goal to see suggested tools.</p>;
  return <ol className="growth-list onboarding-tools">{tools.map(tool => <li key={tool.slug}>
    <Link href={'/becoming/' + tool.slug}>{tool.title}</Link>
    <p>{tool.reason}</p>
  </li>)}</ol>;
}

export function OnboardingSummary({ onboarding }: { onboarding: Awaited<ReturnType<typeof loadOnboarding>> }) {
  if (onboarding.status === 'skipped') return <Link className="text-button" href={onboardingPath}>Set up an optional starting plan</Link>;
  if (onboarding.status === 'new') return <section className="panel growth-panel" aria-labelledby="onboarding-invite">
    <h2 id="onboarding-invite">Choose a place to start</h2>
    <p>Pick what you’d like to explore for a short, optional starting plan.</p>
    <div className="growth-actions">
      <Link className="primary" href={onboardingPath}>Personalize my starting plan</Link>
      <Link className="text-button" href="#growth-modules">Browse all modules</Link>
    </div>
  </section>;
  return <section className="panel growth-panel" aria-labelledby="dashboard-starting-plan">
    <h2 id="dashboard-starting-plan">Your starting plan</h2>
    <StartingTools preferences={onboarding.preferences} />
    <div className="growth-actions">
      <Link className="text-button" href={onboardingPath}>Change starting plan preferences</Link>
      <Link className="text-button" href="#growth-modules">Browse all modules</Link>
    </div>
  </section>;
}
