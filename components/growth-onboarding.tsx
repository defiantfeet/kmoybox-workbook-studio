'use client';

import { useState } from 'react';
import Link from 'next/link';
import { saveOnboarding, skipOnboarding } from '../lib/becoming/onboarding-actions';
import { explorationTopics, accessibilityOptions, durationOptions, notificationOptions, participationOptions, reflectionOptions,
  type OnboardingPreferences } from '../lib/becoming/onboarding';
import type { loadOnboarding } from '../lib/becoming/onboarding-data';
import { StudioForm } from './forms';
import { StartingTools } from './starting-plan';

function OptionalChoice({ label, value, choices, change }: {
  label: string; value: string; choices: readonly string[]; change: (value: string) => void;
}) {
  return <label>{label}<select value={value} onChange={event => change(event.target.value)}>
    <option value="">Leave unspecified</option>{choices.map(choice => <option key={choice}>{choice}</option>)}
  </select></label>;
}

export function GrowthOnboarding({ onboarding, timezone, preview }: {
  onboarding: Awaited<ReturnType<typeof loadOnboarding>>; timezone: string; preview: boolean;
}) {
  const [preferences, setPreferences] = useState(onboarding.preferences);
  const patch = (fields: Partial<OnboardingPreferences>) => setPreferences(current => ({ ...current, ...fields }));
  const updateList = (values: string[], index: number, next: string) => values.map((value, item) => item === index ? next : value);
  const normalized = { ...preferences, times: preferences.times.filter(Boolean) };
  const duplicateTimes = new Set(normalized.times).size !== normalized.times.length;
  return <div className="growth-module-content">
    <section className="panel growth-panel" aria-labelledby="explore-preferences">
      <h2 id="explore-preferences">What would you like to explore?</h2>
      <p>Choose any topics or describe a goal. You can leave anything blank.</p>
      <StudioForm action={saveOnboarding} className="stack growth-form onboarding-form">
        <input type="hidden" name="preferences" value={JSON.stringify(normalized)} />
        <fieldset className="onboarding-checks">
          <legend>Topics of interest</legend>
          {Object.entries(explorationTopics).map(([key, label]) => {
            const topic = key as keyof typeof explorationTopics;
            return <label className="habit-check" key={topic}>
              <input type="checkbox" checked={preferences.topics.includes(topic)} onChange={event =>
                patch({ topics: event.target.checked ? [...preferences.topics, topic] : preferences.topics.filter(item => item !== topic) })} /> {label}
            </label>;
          })}
        </fieldset>
        <p className="muted">The first three topics you choose shape the plan. To change the order, clear a topic and select it again.</p>
        <fieldset className="onboarding-list">
          <legend>Custom goals (optional)</legend>
          {preferences.goals.map((goal, index) => <div key={index} className="onboarding-item">
            <label>Custom goal {index + 1}<input maxLength={160} value={goal} onChange={event =>
              patch({ goals: updateList(preferences.goals, index, event.target.value) })} /></label>
            <button className="text-button" type="button" aria-label={'Remove custom goal ' + (index + 1)}
              onClick={() => patch({ goals: preferences.goals.filter((_, position) => position !== index) })}>Remove</button>
          </div>)}
          {preferences.goals.length < 5 && <button className="secondary" type="button"
            onClick={() => patch({ goals: [...preferences.goals, ''] })}>Add a custom goal</button>}
        </fieldset>
        <details className="onboarding-details">
          <summary>Optional reflection and accessibility preferences</summary>
          <div className="future-grid">
            <OptionalChoice label="Preferred reflection frequency" choices={reflectionOptions} value={preferences.frequency}
              change={value => patch({ frequency: value as OnboardingPreferences['frequency'] })} />
            <OptionalChoice label="Desired social participation" choices={participationOptions} value={preferences.participation}
              change={value => patch({ participation: value as OnboardingPreferences['participation'] })} />
            <OptionalChoice label="Preferred activity duration" choices={durationOptions} value={preferences.duration}
              change={value => patch({ duration: value as OnboardingPreferences['duration'] })} />
            <OptionalChoice label="Notification preference" choices={notificationOptions} value={preferences.reminders}
              change={value => patch({ reminders: value as OnboardingPreferences['reminders'] })} />
          </div>
          <fieldset className="onboarding-checks">
            <legend>Accessibility preferences</legend>
            {accessibilityOptions.map(option => <label className="habit-check" key={option}>
              <input type="checkbox" checked={preferences.accessibility.includes(option)} onChange={event =>
                patch({ accessibility: event.target.checked ? [...preferences.accessibility, option] : preferences.accessibility.filter(value => value !== option) })} /> {option}
            </label>)}
          </fieldset>
          <fieldset className="onboarding-list">
            <legend>Preferred check-in times · {timezone}</legend>
            {preferences.times.map((time, index) => <div key={index} className="onboarding-item">
              <label>Check-in time {index + 1}<input type="time" value={time}
                onChange={event => patch({ times: updateList(preferences.times, index, event.target.value) })} /></label>
              <button className="text-button" type="button" aria-label={'Remove check-in time ' + (index + 1)}
                onClick={() => patch({ times: preferences.times.filter((_, position) => position !== index) })}>Remove</button>
            </div>)}
            {preferences.times.length < 4 && <button className="secondary" type="button"
              onClick={() => patch({ times: [...preferences.times, ''] })}>Add a check-in time</button>}
            {duplicateTimes && <p role="alert">Choose a different time for each check-in.</p>}
          </fieldset>
          <p>These choices are saved for your plan. Set an active check-in schedule and reminders in <Link href="/becoming/mood-tracker">Mood Tracker</Link>.</p>
        </details>
        <button className="primary" disabled={preview || duplicateTimes}>Save starting plan preferences</button>
      </StudioForm>
      <div className="growth-actions">
        {preview ? <Link className="text-button" href="/becoming">Skip onboarding</Link> : <StudioForm action={skipOnboarding}>
          <button className="secondary">{onboarding.status === 'saved' ? 'Hide my starting plan' : 'Skip onboarding'}</button>
        </StudioForm>}
        <Link className="text-button" href="/becoming#growth-modules">Browse all modules</Link>
      </div>
    </section>
    <section className="panel growth-panel" aria-labelledby="onboarding-starting-plan">
      <h2 id="onboarding-starting-plan">Your starting plan</h2>
      <p>Suggestions use your selected topics and optional preferences. A custom goal on its own suggests a planning tool.</p>
      <StartingTools preferences={preferences} />
    </section>
  </div>;
}
