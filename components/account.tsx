import Link from 'next/link';
import { ArrowRight, LogOut } from 'lucide-react';
import { signOut } from '../lib/actions';
import { Heading } from './studio';

export function Account({ displayName, email, sample }: { displayName: string; email?: string; sample: boolean }) {
  return <>
    <Heading title="Your account" subtitle="View your profile and purchased workbooks." />
    <section className="panel form-panel account-panel" aria-labelledby="profile-title">
      <h2 id="profile-title">Profile</h2>
      {sample && <p>This sample profile and any changes you make here in the studio are for demonstration. Sample changes are stored in this browser.</p>}
      <dl>
        <div><dt>Name</dt><dd>{displayName || '—'}</dd></div>
        <div><dt>Email</dt><dd>{email || '—'}</dd></div>
      </dl>
      <div className="actions">
        <Link className="primary" href="/library">My Library <ArrowRight size={15} aria-hidden /></Link>
        {!sample && <form action={signOut}><button className="secondary"><LogOut size={16} aria-hidden /> Sign out</button></form>}
      </div>
    </section>
  </>;
}
