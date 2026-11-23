import Link from 'next/link';
import { StudioForm } from '../../components/forms';
import { requestPasswordReset } from '../../lib/auth/actions';
import { recoveryConfigured } from '../../lib/auth/recovery';
import { demo, supabase } from '../../lib/session';

export const dynamic = 'force-dynamic';

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const configured = !demo && recoveryConfigured() && !!await supabase();
  const query = await searchParams;
  return <main className="login-page">
    <section className="panel login-card">
      <h1>Reset your password</h1>
      {query.expired === '1' && <p role="alert" className="error">The reset link is invalid or expired.</p>}
      {configured ? <StudioForm action={requestPasswordReset} className="stack">
        <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <button className="primary">Send reset link</button>
      </StudioForm> : <p>Password reset is available in the configured Supabase workspace.</p>}
      <Link className="text-button" href="/login">Back to sign in</Link>
    </section>
  </main>;
}
