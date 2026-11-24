import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support and safety | KMOYBOX Workbook Studio',
  referrer: 'no-referrer',
};

export default function SupportPage() {
  return <main className="login-page">
    <article className="panel login-card">
      <p className="eyebrow">KMOYBOX WORKBOOK STUDIO</p>
      <h1>Support and safety</h1>
      <p><strong>The Studio is not monitored for emergencies.</strong> Nobody reviews your entries or check-ins to respond to a crisis.</p>
      <p>The Becoming Studio offers educational tools for personal reflection. It does not provide diagnosis, treatment, or emergency care. You can skip an exercise or stop at any time.</p>
      <section aria-labelledby="immediate-support">
        <h2 id="immediate-support">Get immediate support</h2>
        <p>If you or someone else is in immediate danger, contact your local emergency services.</p>
        <ul className="growth-list">
          <li>In the United States and its territories, call <a className="text-button" href="tel:988?oai_link_source=model_response_hotline">988</a> or use the <a className="text-button" href="https://988lifeline.org/chat/?oai_link_source=model_response_hotline" rel="noreferrer">988 Suicide &amp; Crisis Lifeline chat</a>.</li>
          <li>For support in another country, use <a className="text-button" href="https://findahelpline.com/" rel="noreferrer">Find a Helpline by country</a>.</li>
        </ul>
      </section>
      <Link className="text-button" href="/becoming">Return to Personal Growth</Link>
    </article>
  </main>;
}
