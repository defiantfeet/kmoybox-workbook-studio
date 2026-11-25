import { studioPath } from '../lib/studio-path';
import Link from 'next/link';
import { ArrowRight, LogOut } from 'lucide-react';
import { StudioForm } from './forms';
import { deletePersonalActivity } from '../lib/personal/actions';
import { deleteAccount, signOut, updateProfile } from '../lib/auth/actions';
import { deletionConfigured } from '../lib/auth/credentials';
import { Heading } from './studio';

export function Account({ displayName, email, sample, canEdit }: { displayName: string; email?: string; sample: boolean; canEdit: boolean }) {
  return <>
    <Heading title="Your account" subtitle="View your profile and purchased workbooks." />
    <section className="panel form-panel account-panel" aria-labelledby="profile-title">
      <h2 id="profile-title">Profile</h2>
      {sample && <p>This sample profile and any changes you make here in the studio are for demonstration. Sample changes belong to this browser session.</p>}
      <dl>
        <div><dt>Name</dt><dd>{displayName || '—'}</dd></div>
        <div><dt>Email</dt><dd>{email || '—'}</dd></div>
      </dl>
      {!sample && <StudioForm action={updateProfile} className="stack edit">
        <label>Display name<input key={displayName} name="display_name" defaultValue={displayName} maxLength={80} required autoComplete="name" /></label>
        <button className="primary">Save profile</button>
      </StudioForm>}
      <div className="actions edit">
        <Link className="primary" href="/library">My Library <ArrowRight size={15} aria-hidden /></Link>
        <Link className="secondary" href="/purchases">Purchase history</Link>
        {canEdit && <Link className="secondary" href="/content-editor">Workbook content editor</Link>}
        {!sample && <form action={signOut}><button className="secondary"><LogOut size={16} aria-hidden /> Sign out</button></form>}
      </div>
    </section>
    <section className="panel form-panel account-panel dashboard-section" aria-labelledby="personal-data-title">
      <h2 id="personal-data-title">Personal data</h2>
      <p>Export or delete your journal entries, goals, milestone history, workbook responses, and Personal Growth exercises, check-ins, habits, and reflections. Your sign-in and purchases stay active.</p>
      <a className="secondary" href={studioPath('/personal-data')}>Download personal data (JSON)</a>
      <details className="edit">
        <summary>Delete personal activity</summary>
        <p className="muted">This permanently removes the saved activity listed above.</p>
        <StudioForm className="stack edit" action={deletePersonalActivity}>
          <label>Type DELETE to confirm<input name="confirmation" required autoComplete="off" pattern="DELETE" /></label>
          <button className="secondary">Permanently delete my activity</button>
        </StudioForm>
      </details>
    </section>
    {!sample && <section className="panel form-panel account-panel dashboard-section" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title">Delete account</h2>
      <p>This permanently removes your sign-in, profile, purchases recorded in Studio, and saved personal activity.</p>
      {deletionConfigured() ? <details className="edit">
        <summary>Delete my account</summary>
        <StudioForm action={deleteAccount} className="stack edit">
          <label>Current password<input name="password" type="password" autoComplete="current-password" required /></label>
          <label>Type DELETE MY ACCOUNT to confirm<input name="confirmation" pattern="DELETE MY ACCOUNT" autoComplete="off" required /></label>
          <button className="secondary">Permanently delete my account</button>
        </StudioForm>
      </details> : <p className="muted">Account deletion requires the workspace’s server credentials.</p>}
    </section>}
  </>;
}
