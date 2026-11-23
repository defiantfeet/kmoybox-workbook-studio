import { accountAdmin } from '../../../lib/auth/credentials';
import { paymentEvent, verifyStripeTestEvent } from '../../../lib/payments/events';
import { testStripe, webhookSecret } from '../../../lib/payments/stripe';
import { demo } from '../../../lib/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const stripe = testStripe();
  const secret = webhookSecret();
  if (demo || !stripe || !secret) return new Response(null, { status: 503 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response(null, { status: 400 });

  let event;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > 1024 * 1024) return new Response(null, { status: 413 });
    event = verifyStripeTestEvent(stripe, body, signature, secret);
  } catch {
    return new Response(null, { status: 400 });
  }

  try {
    const payment = await paymentEvent(event, {
      payment: id => stripe.paymentIntents.retrieve(id),
      refunds: id => stripe.refunds.list({ payment_intent: id, limit: 100 }),
    });
    if (!payment) return new Response(null, { status: 204 });
    const admin = accountAdmin();
    if (!admin) return new Response(null, { status: 503 });
    const result = await admin.rpc('record_workbook_payment', payment);
    if (result.error) return new Response(null, { status: 500 });
    if (result.data === 'mismatch') console.error('Stripe test event did not match its Studio purchase', event.id);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 500 });
  }
}
