import { expect, test } from '@playwright/test';
import Stripe from 'stripe';
import { paymentEvent, verifyStripeTestEvent } from '../lib/payments/events';

const stripe = new Stripe('sk_test_signature_fixture');
const secret = 'whsec_synthetic_workbook_test';
const purchase = '00000000-0000-4000-8000-000000000057';

function checkoutEvent(overrides: Record<string, unknown> = {}, live = false) {
  return {
    id: 'evt_synthetic', type: 'checkout.session.completed', livemode: live,
    data: { object: { id: 'cs_test_sample', livemode: false, mode: 'payment', payment_status: 'paid',
      metadata: { studio_purchase_id: purchase }, payment_intent: 'pi_sample', amount_total: 1200, currency: 'usd', ...overrides } },
  } as unknown as Stripe.Event;
}

const intent = {
  id: 'pi_sample', livemode: false, status: 'succeeded', amount_received: 1200,
  currency: 'usd', metadata: { studio_purchase_id: purchase },
} as const;

test('verifies the Stripe signature against the raw request and rejects live mode', () => {
  const payload = JSON.stringify(checkoutEvent());
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  expect(verifyStripeTestEvent(stripe, payload, header, secret).id).toBe('evt_synthetic');
  expect(() => verifyStripeTestEvent(stripe, payload.replace('1200', '1000'), header, secret)).toThrow();
  const live = JSON.stringify(checkoutEvent({}, true));
  expect(() => verifyStripeTestEvent(stripe, live, stripe.webhooks.generateTestHeaderString({ payload: live, secret }), secret)).toThrow();
});

test('requires paid and matching Stripe objects and counts only successful refunds', async () => {
  const lookup = {
    payment: async () => intent,
    refunds: async function* () {
      yield { status: 'pending', amount: 1000 };
      yield { status: 'succeeded', amount: 200 };
    },
  };
  await expect(paymentEvent(checkoutEvent({ payment_status: 'unpaid' }), lookup)).resolves.toBeNull();
  await expect(paymentEvent(checkoutEvent({ amount_total: 1300 }), lookup)).resolves.toBeNull();
  await expect(paymentEvent(checkoutEvent(), lookup)).resolves.toMatchObject({
    purchase_id: purchase, payment_state: 'paid', received_amount: 1200, refund_total: 200,
  });
  const refund = { id: 'evt_refund', type: 'refund.updated', livemode: false, data: { object: { payment_intent: 'pi_sample' } } } as unknown as Stripe.Event;
  await expect(paymentEvent(refund, lookup)).resolves.toMatchObject({ payment_state: 'refund', refund_total: 200 });
});
