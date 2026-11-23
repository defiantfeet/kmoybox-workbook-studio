'use client';

export default function StudioError({ reset }: { reset: () => void }) {
  return <main className="login-page">
    <section className="panel login-card">
      <h1>Your studio couldn’t load.</h1>
      <p>Try again in a moment.</p>
      <button className="primary" onClick={reset}>Try again</button>
    </section>
  </main>;
}
