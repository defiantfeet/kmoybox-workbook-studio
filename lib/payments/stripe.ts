import 'server-only';

import Stripe from 'stripe';

export function testStripe() {
  const key = process.env.STRIPE_TEST_SECRET_KEY;
  if (!key || !/^(sk|rk)_test_\S+$/.test(key)) return null;
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 });
}

export function webhookSecret() {
  const secret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
  return secret?.startsWith('whsec_') ? secret : null;
}
