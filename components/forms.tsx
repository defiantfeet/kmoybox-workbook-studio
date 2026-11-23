'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { ActionState } from '../lib/actions';
import { authenticate } from '../lib/auth/actions';

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

export function Login({ configured, failed, reset, deleted }: { configured: boolean; failed: boolean; reset: boolean; deleted: boolean }) {
  const [signup, setSignup] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <main className="login-page">
    <section className="panel login-card">
      <p className="eyebrow">KMOYBOX WORKBOOK STUDIO</p>
      <h1>{signup ? 'Make space for yourself.' : 'Welcome to your studio.'}</h1>
      <p className="muted">A personal space to reflect, set intentions, and grow.</p>
      {!configured && <p role="status">Local Supabase configuration is required to sign in.</p>}
      {reset && <p role="status">Password updated. Sign in with your new password.</p>}
      {deleted && <p role="status">Your account was deleted.</p>}
      {failed && <p role="alert" className="error">This confirmation link is invalid or expired.</p>}
      <StudioForm action={authenticate} className="stack">
        <input type="hidden" name="mode" value={signup ? 'signup' : 'login'} />
        {signup && <label>Your name<input name="name" autoComplete="given-name" maxLength={80} /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 12 : undefined} maxLength={signup ? 72 : undefined} required /></label>
        <button className="primary" disabled={!configured}>{signup ? 'Create your account' : 'Sign in'}</button>
      </StudioForm>
      {!signup && configured && <Link className="text-button" href="/forgot-password">Forgot password?</Link>}
      <button className="text-button" type="button" disabled={!ready} onClick={() => setSignup(!signup)}>{signup ? 'Already have an account? Sign in' : 'New to the studio? Create an account'}</button>
    </section>
  </main>;
}
