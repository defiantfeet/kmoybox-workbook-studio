'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { authenticate, type ActionState } from '../lib/actions';

export function StudioForm({ action, children, className }: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, { message: '' });
  return <form action={dispatch} className={className}>
    <fieldset disabled={pending}>{children}</fieldset>
    {state.message && <p className={state.error ? 'error feedback' : 'feedback'} role={state.error ? 'alert' : 'status'}>{state.message}</p>}
  </form>;
}

export function Login({ configured, failed }: { configured: boolean; failed: boolean }) {
  const [signup, setSignup] = useState(false);
  return <main className="login-page">
    <section className="panel login-card">
      <p className="eyebrow">KMOYBOX WORKBOOK STUDIO</p>
      <h1>{signup ? 'Make space for yourself.' : 'Welcome to your studio.'}</h1>
      <p className="muted">A personal space to reflect, set intentions, and grow.</p>
      {!configured && <p role="status">Local Supabase configuration is required to sign in.</p>}
      {failed && <p role="alert" className="error">This confirmation link is invalid or expired.</p>}
      <StudioForm action={authenticate} className="stack">
        <input type="hidden" name="mode" value={signup ? 'signup' : 'login'} />
        {signup && <label>Your name<input name="name" autoComplete="given-name" maxLength={80} /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={6} required /></label>
        <button className="primary" disabled={!configured}>{signup ? 'Create your account' : 'Sign in'}</button>
      </StudioForm>
      <button className="text-button" type="button" onClick={() => setSignup(!signup)}>{signup ? 'Already have an account? Sign in' : 'New to the studio? Create an account'}</button>
    </section>
  </main>;
}
