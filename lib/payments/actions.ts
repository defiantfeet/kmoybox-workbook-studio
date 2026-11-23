'use server';

import { redirect } from 'next/navigation';
import { account } from '../data';
import { demo } from '../session';
import { accountAdmin } from '../auth/credentials';
import { authURL } from '../auth/recovery';
import type { ActionState } from '../actions';
import { slugSchema } from '../workbooks/schema';
import { testStripe, webhookSecret } from './stripe';

type Reserved = {
  id: string; amount: number; currency: string; stripe_price_id: string;
  stripe_session_id: string | null; created_at: string;
};

const error = (message: string): ActionState => ({ message, error: true });

export async function startWorkbookCheckout(slug: string): Promise<ActionState> {
  if (demo || !slugSchema.safeParse(slug).success) return error('Test Checkout is unavailable.');
  const { user } = await account();
  const stripe = testStripe();
  const admin = accountAdmin();
  if (!stripe || !admin || !webhookSecret()) return error('Test Checkout is unavailable.');
  const reserved = await admin.rpc('reserve_workbook_checkout', { owner_id: user.id, book_slug: slug });
  if (reserved.error) return error('Checkout could not start. Try again.');
  if (!reserved.data) return error('This workbook is unavailable for purchase or already unlocked.');
  const order = reserved.data as Reserved;
  let destination: string;

  try {
    let session;
    if (order.stripe_session_id) {
      session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    } else {
      // Stripe retains idempotency keys for at least 24 hours. Stop if an unknown
      // session could exist beyond that interval and let its webhook reconcile.
      if (Date.now() - Date.parse(order.created_at) >= 23 * 60 * 60 * 1000) {
        return error('An earlier Checkout is awaiting reconciliation.');
      }
      const price = await stripe.prices.retrieve(order.stripe_price_id);
      if (price.livemode !== false || !price.active || price.type !== 'one_time'
        || price.unit_amount !== order.amount || price.currency !== order.currency) {
        return error('This test price is unavailable.');
      }
      const metadata = { studio_purchase_id: order.id };
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: order.stripe_price_id, quantity: 1 }],
        client_reference_id: order.id,
        metadata,
        payment_intent_data: { metadata },
        success_url: authURL('/purchases?checkout=complete').href,
        cancel_url: authURL('/workbooks/' + slug).href,
      }, { idempotencyKey: 'studio-workbook-' + order.id });
      if (session.livemode !== false || !session.id.startsWith('cs_test_')) return error('Test Checkout is unavailable.');
      const bound = await admin.rpc('bind_workbook_checkout', { purchase_id: order.id, session_id: session.id });
      if (bound.error || bound.data !== true) return error('Checkout could not be saved. Try again.');
    }

    if (session.livemode !== false || !session.id.startsWith('cs_test_')
      || session.metadata?.studio_purchase_id !== order.id) return error('Test Checkout is unavailable.');
    if (session.status === 'expired') return error('This Checkout expired. Try again after Stripe updates the purchase status.');
    if (session.status === 'complete') {
      destination = '/purchases?checkout=complete';
    } else {
      if (!session.url || new URL(session.url).origin !== 'https://checkout.stripe.com') return error('Test Checkout is unavailable.');
      destination = session.url;
    }
  } catch {
    return error('Stripe Test Checkout could not start. Try again.');
  }
  redirect(destination);
}
