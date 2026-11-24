'use client';

import { saveInsightPreferences } from '../lib/becoming/insight-actions';
import { insightCategories, insightKeys, type InsightKey } from '../lib/becoming/insights';
import { StudioForm } from './forms';

export function InsightPreferences({ hidden, preview }: { hidden: InsightKey[]; preview: boolean }) {
  return <details className="panel growth-panel insights-settings">
    <summary>Choose which insights to show</summary>
    <StudioForm action={saveInsightPreferences} className="stack growth-form">
      <fieldset className="insights-checkboxes"><legend>Visible categories</legend>
        {insightKeys.map(key => <label key={key} className="habit-check">
          <input type="checkbox" name="shown" value={key} defaultChecked={!hidden.includes(key)} /> {insightCategories[key]}
        </label>)}
      </fieldset>
      <button className="primary" disabled={preview}>Save insight preferences</button>
    </StudioForm>
  </details>;
}
