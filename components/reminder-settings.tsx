'use client';

import { useEffect, useState } from 'react';
import { pauseReminders, saveReminderSettings } from '../lib/becoming/reminder-actions';
import { frequencies, reminderChannels, reminderKeys, reminderTypes, type ReminderSettings, type ReminderRule,
  type ReminderType } from '../lib/becoming/reminders';
import { weekdays } from '../lib/becoming/habits';
import { StudioForm } from './forms';
import { notifyReminderChange } from './reminder-center';

const frequencyNames = { due: 'When due', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' } as const;
const channelNames = { app: 'In-app', browser: 'Browser while Studio is open', both: 'In-app and browser' } as const;

export function ReminderSettingsForm({ saved, configured, pausedUntil, timezone, timezones, preview }: {
  saved: ReminderSettings; configured: boolean; pausedUntil: string | null; timezone: string; timezones: string[]; preview: boolean;
}) {
  const [settings, setSettings] = useState(saved);
  const [zone, setZone] = useState(timezone);
  const [permission, setPermission] = useState<NotificationPermission | 'unavailable' | 'unknown'>('unknown');
  useEffect(() => {
    setPermission(window.isSecureContext && typeof Notification !== 'undefined' ? Notification.permission : 'unavailable');
  }, []);
  const patch = (fields: Partial<ReminderSettings>) => setSettings(current => ({ ...current, ...fields }));
  const updateRule = (kind: ReminderType, fields: Partial<ReminderRule>) => setSettings(current => ({
    ...current, rules: { ...current.rules, [kind]: { ...current.rules[kind], ...fields } },
  }));
  const paused = Boolean(pausedUntil && Date.parse(pausedUntil) > Date.now());
  return <div className="growth-module-content">
    <section className="panel growth-panel" aria-labelledby="central-settings">
      <h2 id="central-settings">Reminder preferences</h2>
      {!configured && <p>Save these settings to manage delivery in one place. Current module preferences remain active until you save.</p>}
      <p>Reminders appear while The Becoming Studio is open. Mood reminders follow the active check-in days and slots in Mood Tracker.</p>
      <StudioForm action={async (previous, form) => {
        const result = await saveReminderSettings(previous, form);
        if (!result.error) notifyReminderChange();
        return result;
      }} className="stack growth-form central-reminders-form">
        <input type="hidden" name="settings" value={JSON.stringify(settings)} />
        <label className="habit-check"><input type="checkbox" checked={!settings.enabled}
          onChange={event => patch({ enabled: !event.target.checked })} /> Disable all reminders</label>
        <div className="future-grid">
          <label>Studio timezone<select name="timezone" value={zone} onChange={event => setZone(event.target.value)}>
            {timezones.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label>Quiet hours start (optional)<input type="time" value={settings.quietStart ?? ''}
            onChange={event => patch({ quietStart: event.target.value || null })} /></label>
          <label>Quiet hours end (optional)<input type="time" value={settings.quietEnd ?? ''}
            onChange={event => patch({ quietEnd: event.target.value || null })} /></label>
        </div>
        <p className="muted">The timezone also applies to your Studio calendar. Quiet hours can cross midnight.</p>
        {reminderKeys.map(kind => {
          const entry = settings.rules[kind];
          return <details key={kind} className="central-rule">
            <summary>{reminderTypes[kind][0]} · {entry.enabled ? 'On' : 'Off'}</summary>
            <label className="habit-check"><input type="checkbox" checked={entry.enabled} onChange={event => updateRule(kind, { enabled: event.target.checked })} />
              Enable {reminderTypes[kind][0].toLowerCase()} reminder</label>
            <div className="future-grid">
              <label>Frequency<select value={entry.frequency}
                onChange={event => updateRule(kind, { frequency: event.target.value as ReminderRule['frequency'] })}>
                {frequencies.map(value => <option key={value} value={value}>{frequencyNames[value]}</option>)}
              </select></label>
              <label>Local time<input type="time" required value={entry.time} onChange={event => updateRule(kind, { time: event.target.value })} /></label>
              {entry.frequency === 'weekly' && <label>Day of week<select value={entry.weekday}
                onChange={event => updateRule(kind, { weekday: Number(event.target.value) })}>
                {weekdays.map((value, index) => <option key={value} value={index + 1}>{value}</option>)}
              </select></label>}
              {entry.frequency === 'monthly' && <label>Day of month<input type="number" required min={1} max={28}
                value={Number.isFinite(entry.monthDay) ? entry.monthDay : ''} onChange={event => updateRule(kind, { monthDay: event.target.valueAsNumber })} /></label>}
              <label>Delivery channel<select value={entry.channel}
                onChange={event => updateRule(kind, { channel: event.target.value as ReminderRule['channel'] })}>
                {reminderChannels.map(value => <option key={value} value={value}>{channelNames[value]}</option>)}
              </select></label>
            </div>
          </details>;
        })}
        <button className="primary" disabled={preview}>Save reminder settings</button>
      </StudioForm>
    </section>
    <section className="panel growth-panel" aria-labelledby="reminders-pause">
      <h2 id="reminders-pause">Pause reminders</h2>
      <p>{paused && pausedUntil ? 'Paused until ' + new Intl.DateTimeFormat('en', {
        timeZone: timezone, dateStyle: 'medium', timeStyle: 'short',
      }).format(new Date(pausedUntil)) + '.' : 'Pause delivery for 24 hours and resume whenever you’re ready.'}</p>
      <StudioForm action={async (previous, form) => {
        const result = await pauseReminders(previous, form);
        if (!result.error) notifyReminderChange();
        return result;
      }}>
        <button className="secondary" name="pause" value={paused ? 'resume' : '24h'} disabled={preview || !configured}>
          {paused ? 'Resume reminders' : 'Pause reminders for 24 hours'}
        </button>
      </StudioForm>
    </section>
    <section className="panel growth-panel" aria-labelledby="browser-reminders">
      <h2 id="browser-reminders">Browser notifications</h2>
      <p>Permission applies to this browser and device. Some browsers, especially on phones, can’t show notifications from an open page.</p>
      <p role="status">{permission === 'granted' ? 'Browser permission is granted.' : permission === 'denied'
        ? 'Permission is blocked. You can change it in your browser settings.'
        : permission === 'unavailable' ? 'Browser notifications are unavailable here. In-app reminders are available.'
          : 'Choose whether to allow browser notifications.'}</p>
      {permission === 'default' && <button className="secondary" type="button" disabled={preview} onClick={async () => {
        try { setPermission(await Notification.requestPermission()); notifyReminderChange(); }
        catch { setPermission('unavailable'); }
      }}>Allow browser notifications</button>}
      <p>Choose a browser delivery channel for a reminder after granting permission.</p>
    </section>
  </div>;
}
