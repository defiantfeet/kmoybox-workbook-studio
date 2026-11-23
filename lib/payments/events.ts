import type Stripe from 'stripe';
import { z } from 'zod';

export function verifyStripeTestEvent(stripe: Stripe, body: string, signature: string, secret: string): Stripe.Event {
  const event = stripe.webhooks.constructEvent(body, signature, secret);
  if (event.livemode !== false) throw new Error('Expected a Stripe test event.');
  return event;
}

type PaymentEvent = {
  event_id: string; purchase_id: string; session_id: string | null; payment_id: string | null;
  payment_state: 'paid' | 'expired' | 'failed' | 'refund'; received_amount: number | null;
  payment_currency: string | null; refund_total: number | null;
};

const purchaseId = z.uuid();
function referenceId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id;
}

export async function paymentEvent(
  event: Stripe.Event,
  lookup: {
    payment(id: string): Promise<Pick<Stripe.PaymentIntent, 'id' | 'livemode' | 'status' | 'amount_received' | 'currency' | 'metadata'>>;
    refunds(id: string): AsyncIterable<Pick<Stripe.Refund, 'status' | 'amount'>>;
  },
): Promise<PaymentEvent | null> {
  if (event.livemode !== false) return null;
  let session: Stripe.Checkout.Session | undefined;
  let payment: string | undefined;
  let state: PaymentEvent['payment_state'];

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      session = event.data.object;
      if (session.livemode !== false || session.mode !== 'payment' || !session.id.startsWith('cs_test_')) return null;
      if (!purchaseId.safeParse(session.metadata?.studio_purchase_id).success) return null;
      payment = referenceId(session.payment_intent);
      if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
        return {
          event_id: event.id, purchase_id: session.metadata!.studio_purchase_id, session_id: session.id,
          payment_id: payment ?? null, payment_state: event.type === 'checkout.session.expired' ? 'expired' : 'failed',
          received_amount: null, payment_currency: null, refund_total: null,
        };
      }
      if (session.payment_status !== 'paid') return null;
      state = 'paid';
      break;
    }
    case 'charge.refunded':
    case 'refund.created':
    case 'refund.updated':
      payment = referenceId(event.data.object.payment_intent);
      state = 'refund';
      break;
    default:
      return null;
  }

  if (!payment) return null;
  const intent = await lookup.payment(payment);
  const id = purchaseId.safeParse(intent.metadata.studio_purchase_id);
  if (!id.success || intent.livemode !== false || intent.status !== 'succeeded' || intent.id !== payment) return null;
  if (session && (session.metadata?.studio_purchase_id !== id.data
    || session.amount_total !== intent.amount_received || session.currency !== intent.currency)) return null;

  let total = 0;
  for await (const refund of lookup.refunds(intent.id)) {
    if (refund.status === 'succeeded') total += refund.amount;
  }
  return {
    event_id: event.id, purchase_id: id.data, session_id: session?.id ?? null, payment_id: payment,
    payment_state: state, received_amount: intent.amount_received, payment_currency: intent.currency,
    refund_total: total,
  };
}
