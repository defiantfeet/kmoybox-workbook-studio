import 'server-only';

import type { account } from '../data';
import { emptyOnboarding, onboardingSchema } from './onboarding';

type Client = Awaited<ReturnType<typeof account>>['client'];
type OnboardingStatus = 'new' | 'saved' | 'skipped';

export async function loadOnboarding(client: Client | null, owner: string) {
  if (!client) return { status: 'new' as OnboardingStatus, preferences: emptyOnboarding };
  const { data, error } = await client.from('notification_preferences').select('onboarding_status,growth_onboarding')
    .eq('user_id', owner).maybeSingle();
  if (error) throw new Error('Your onboarding preferences could not be loaded.');
  const preferences = onboardingSchema.safeParse(data?.growth_onboarding);
  const status: OnboardingStatus = data?.onboarding_status === 'saved' || data?.onboarding_status === 'skipped'
    ? data.onboarding_status : 'new';
  return { status, preferences: preferences.success ? preferences.data : emptyOnboarding };
}
