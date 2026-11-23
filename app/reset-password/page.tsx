import { redirect } from 'next/navigation';
import { StudioForm } from '../../components/forms';
import { updatePassword } from '../../lib/auth/actions';
import { recoveryAllowed } from '../../lib/auth/recovery';
import { demo, supabase } from '../../lib/session';

export const dynamic = 'force-dynamic';

export default async function ResetPassword() {
  const client = demo ? null : await supabase();
  if (!client) redirect('/forgot-password?expired=1');
  const { data: { user } } = await client.auth.getUser();
  const { data } = await client.auth.getClaims();
  const sessionId = data?.claims.session_id;
  if (!user || typeof sessionId !== 'string' || !(await recoveryAllowed(user.id, sessionId))) redirect('/forgot-password?expired=1');
  return <main className="login-page">
    <section className="panel login-card">
      <h1>Choose a new password</h1>
      <p className="muted">Use at least 12 characters.</p>
      <StudioForm action={updatePassword} className="stack">
        <label>New password<input name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /></label>
        <label>Confirm new password<input name="confirm_password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /></label>
        <button className="primary">Update password</button>
      </StudioForm>
    </section>
  </main>;
}
