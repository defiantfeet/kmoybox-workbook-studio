'use client';

import { useState } from 'react';
import type { ActionState } from '../lib/actions';
import { EmotionPicker } from './emotion-picker';
import { StudioForm } from './forms';

type Save = (state: ActionState, form: FormData) => Promise<ActionState>;

export function GrowthFields({ action, fields, answers, revision, exercise, disabled, useEmotions, initialEmotions }: {
  action: Save; fields: readonly { label: string; options?: readonly string[] }[];
  answers?: Record<string, string>; revision?: string; exercise?: boolean; disabled: boolean; useEmotions?: boolean; initialEmotions?: string[];
}) {
  const [emotions, setEmotions] = useState(initialEmotions ?? []);
  const [values, setValues] = useState<Record<string, string>>(answers ?? {});
  return <StudioForm action={action} className="stack growth-form">
    <input type="hidden" name="revision" value={revision ?? ''} />
    {fields.map(({ label, options }, index) => {
      const name = String(index);
      const update = (value: string) => setValues(old => ({ ...old, [name]: value }));
      return <label key={label}>{label}
        {options
          ? <select name={name} value={values[name] ?? ''} onChange={event => update(event.target.value)} disabled={disabled}>
            <option value="">Choose an option</option>
            {options.map(option => <option key={option}>{option}</option>)}
          </select>
          : <textarea name={name} rows={3} value={values[name] ?? ''} onChange={event => update(event.target.value)} maxLength={2000} disabled={disabled} />}
      </label>;
    })}
    {useEmotions && <details>
      <summary>Explore emotions (optional)</summary>
      <EmotionPicker value={emotions} onChange={setEmotions} disabled={disabled} />
      <input type="hidden" name="emotions" value={JSON.stringify(emotions)} />
    </details>}
    <div className="growth-actions">
      {exercise ? <>
        <button className="secondary" name="intent" value="draft" disabled={disabled}>Save draft</button>
        <button className="primary" name="intent" value="complete" disabled={disabled}>Mark complete</button>
      </> : <button className="primary" disabled={disabled}>Save reflection</button>}
    </div>
  </StudioForm>;
}

export function MoodFields({ action, moods, mood, note, disabled, initialEmotions }: {
  action: Save; moods: string[]; mood?: string; note?: string; disabled: boolean; initialEmotions?: string[];
}) {
  const [emotions, setEmotions] = useState(initialEmotions ?? []);
  const [feeling, setFeeling] = useState(mood ?? '');
  const [text, setText] = useState(note ?? '');
  return <StudioForm action={action} className="stack growth-form">
    <label>Mood<select name="mood" required={!emotions.length} value={emotions.length ? '' : feeling} onChange={event => { setFeeling(event.target.value); setEmotions([]); }} disabled={disabled}>
      <option value="">Choose a mood</option>
      {moods.map(option => <option key={option}>{option}</option>)}
    </select></label>
    <details>
      <summary>Use the Emotional Wheel{emotions.length > 0 ? ' (' + emotions.length + ' selected)' : ''}</summary>
      <EmotionPicker value={emotions} onChange={labels => { setEmotions(labels); setFeeling(''); }} disabled={disabled} />
    </details>
    <input type="hidden" name="emotions" value={JSON.stringify(emotions)} />
    <label>Note (optional)<textarea name="note" rows={2} value={text} onChange={event => setText(event.target.value)} maxLength={2000} disabled={disabled} /></label>
    <button className="primary" disabled={disabled}>Save check-in</button>
  </StudioForm>;
}
