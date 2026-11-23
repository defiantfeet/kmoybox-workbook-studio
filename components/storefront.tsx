import Link from 'next/link';
import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react';
import { startWorkbookCheckout } from '../lib/payments/actions';
import type { purchaseHistory } from '../lib/payments/history';
import type { WorkbookOffer } from '../lib/workbooks/schema';
import { StudioForm } from './forms';
import { Heading } from './studio';

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' });

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
}

function offerPrice(book: WorkbookOffer) {
  return book.amount != null && book.currency ? money(book.amount, book.currency) : book.requires_purchase ? 'Currently unavailable' : 'Free';
}

export function WorkbookOfferCard({ book }: { book: WorkbookOffer }) {
  return <article className="panel form-panel">
    {book.sample && <p className="eyebrow">Demonstration workbook</p>}
    <h2>{book.title}</h2>
    <p>{book.summary}</p>
    <p className="workbook-price">{offerPrice(book)}{book.owned && ' · Purchased'}</p>
    <Link className="text-button" href={'/workbooks/' + book.slug}>
      {book.unlocked ? 'Open ' : 'View '}{book.title} <ArrowRight size={15} aria-hidden />
    </Link>
  </article>;
}

export function LockedWorkbook({ book }: { book: WorkbookOffer }) {
  return <>
    <Link href="/workbooks" className="text-button back"><ArrowLeft size={16} aria-hidden /> All workbooks</Link>
    <Heading title={book.title} subtitle={book.summary} />
    <section className="panel form-panel account-panel">
      <p className="locked"><LockKeyhole size={16} aria-hidden /> Purchase required</p>
      <h2 className="workbook-price">{offerPrice(book)}</h2>
      {book.amount != null && <>
        <p>Stripe Test Checkout uses test payment details. Your workbook unlocks after Stripe confirms the payment.</p>
        <StudioForm action={startWorkbookCheckout.bind(null, book.slug)} className="stack">
          <button className="primary">Buy with Stripe Test Checkout</button>
        </StudioForm>
      </>}
      <Link className="text-button" href="/purchases">View purchase history</Link>
    </section>
  </>;
}

const labels = {
  pending: 'Awaiting payment confirmation', paid: 'Paid', failed: 'Payment failed',
  expired: 'Checkout expired', refunded: 'Refunded', revoked: 'Access revoked',
};

export function Purchases({ rows, returned }: { rows: Awaited<ReturnType<typeof purchaseHistory>>; returned: boolean }) {
  return <>
    <Heading title="Purchase history" subtitle="Your Stripe test purchases and their current access status." />
    {returned && <div className="panel form-panel">
      <p>Returned from Checkout. Access updates when Stripe confirms your payment.</p>
      <a className="text-button" href="/purchases">Refresh purchase history</a>
    </div>}
    <div className="stack dashboard-section">
      {!rows.length && <p className="panel empty">No Stripe purchases yet. <Link href="/workbooks">Browse workbooks</Link></p>}
      {rows.map(row => <article className="panel form-panel" key={row.id}>
        <h2>{row.title}</h2>
        <p>{money(row.amount, row.currency)} · {labels[row.status]} · <time dateTime={row.created_at}>{dateFormat.format(new Date(row.created_at))}</time></p>
        {row.refunded_amount > 0 && <p>{money(row.refunded_amount, row.currency)} refunded</p>}
        {row.status === 'paid' && <Link className="text-button" href={'/workbooks/' + row.workbook_slug}>Open workbook</Link>}
        {row.status === 'pending' && <Link className="text-button" href={'/workbooks/' + row.workbook_slug}>Return to workbook offer</Link>}
      </article>)}
    </div>
  </>;
}
