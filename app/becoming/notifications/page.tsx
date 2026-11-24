import Link from 'next/link';
import { ReminderSettingsForm } from '../../../components/reminder-settings';
import { Heading, Shell } from '../../../components/studio';
import { growthAccount, growthTimezones } from '../../../lib/becoming/data';
import { reminderPreferences } from '../../../lib/becoming/reminder-data';
import { demo } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const { client, owner, name, timezone } = await growthAccount();
  const preferences = await reminderPreferences(client, owner);
  return <Shell current="becoming" name={name} sample={demo}>
    <Link className="text-button growth-back" href="/becoming">Back to Personal Growth</Link>
    <Heading title="Notification settings" subtitle="Choose what to be reminded about and when." />
    <ReminderSettingsForm saved={preferences.settings} configured={preferences.configured} pausedUntil={preferences.pausedUntil}
      timezone={timezone} timezones={growthTimezones} preview={demo} />
  </Shell>;
}
