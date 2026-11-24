'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { respondToReminder } from '../lib/becoming/reminder-actions';
import { reminderMessage, remindersPath, reminderTypes, type ReminderNotice } from '../lib/becoming/reminders';
import { studioPath } from '../lib/studio-path';
import { StudioForm } from './forms';

type InboxItem = ReminderNotice & { snoozed_until: string | null };
export const notifyReminderChange = () => window.dispatchEvent(new Event('studio-reminders-changed'));

export function ReminderCenter() {
  const pathname = usePathname();
  const inbox = pathname?.endsWith(remindersPath) ?? false;
  const [items, setItems] = useState<InboxItem[]>([]);
  useEffect(() => {
    let disposed = false;
    let running = false;
    let pending = false;
    const visible = () => document.visibilityState === 'visible';
    async function refresh() {
      if (disposed || !visible()) return;
      if (running) { pending = true; return; }
      running = true;
      try {
        const browser = window.isSecureContext && typeof Notification !== 'undefined' && Notification.permission === 'granted';
        const response = await fetch(studioPath(remindersPath + '/poll'), {
          method: 'POST', cache: 'no-store', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ browser, inbox }),
        });
        if (!response.ok) return;
        const data = await response.json() as { notices: InboxItem[]; browser: ReminderNotice[] };
        if (disposed) return;
        setItems(data.notices);
        if (browser && visible()) for (const item of data.browser) {
          try {
            const notice = new Notification('The Becoming Studio', { body: reminderMessage, tag: 'studio-' + item.id });
            notice.onclick = () => { window.focus(); window.location.assign(studioPath(remindersPath)); notice.close(); };
          } catch {
            // Some devices expose the API but do not support page-created notifications.
          }
        }
      } catch {
        // A later poll can retry without changing the reminder's occurrence key.
      } finally {
        running = false;
        if (pending && !disposed) { pending = false; void refresh(); }
      }
    }
    const interval = window.setInterval(() => void refresh(), 60000);
    window.addEventListener('studio-reminders-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    void refresh();
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('studio-reminders-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [inbox, pathname]);

  if (!items.length && !inbox) return null;
  return <section className="panel growth-panel central-inbox" aria-labelledby="central-inbox">
    <h2 id="central-inbox">{inbox ? 'Reminder inbox' : 'Studio reminders'}</h2>
    {items.length ? <ul className="growth-list">{items.map(item => <li key={item.id}>
      <p>{reminderMessage}{item.snoozed_until && Date.parse(item.snoozed_until) > Date.now() && ' Snoozed.'}</p>
      <Link className="text-button" href={reminderTypes[item.type][1]}>Open reminder<span className={inbox ? undefined : 'growth-sr'}> for {reminderTypes[item.type][0]}</span></Link>
      <StudioForm action={async (previous, form) => {
        const result = await respondToReminder(item.id, previous, form);
        if (!result.error) {
          setItems(current => current.filter(entry => entry.id !== item.id));
          notifyReminderChange();
        }
        return result;
      }}>
        <div className="growth-actions">
          <button className="secondary" name="action" value="15">Snooze 15 minutes</button>
          <button className="secondary" name="action" value="60">Snooze 1 hour</button>
          <button className="secondary" name="action" value="1440">Snooze 24 hours</button>
          <button className="text-button" name="action" value="dismiss">Dismiss</button>
        </div>
      </StudioForm>
    </li>)}</ul> : <p className="muted">No reminders to review right now.</p>}
    {!inbox && <Link className="text-button" href={remindersPath}>Notification settings</Link>}
  </section>;
}
