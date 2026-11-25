'use client';

import { useGrowthContent } from './growth-content-context';

import { useId, useState } from 'react';
import { emotionLabel, emotionSlots, emotionTaxonomy, emotionVocabulary, quickEmotions } from '../lib/becoming/emotions';

type Props = {
  value: string[]; onChange: (value: string[]) => void; disabled?: boolean; showWheel?: boolean; quick?: boolean;
};

const center = 215;
function point(radius: number, angle: number) {
  return [(center + radius * Math.cos(angle)).toFixed(3), (center + radius * Math.sin(angle)).toFixed(3)];
}

function segment(inner: number, outer: number, start: number, end: number) {
  const large = end - start > Math.PI ? 1 : 0;
  return 'M ' + point(outer, start).join(' ') + ' A ' + outer + ' ' + outer + ' 0 ' + large + ' 1 ' + point(outer, end).join(' ')
    + ' L ' + point(inner, end).join(' ') + ' A ' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + point(inner, start).join(' ') + ' Z';
}

function Wheel({ category, branch, setCategory, setBranch, value, toggle, disabled }: {
  category: number; branch: number; setCategory: (index: number) => void; setBranch: (index: number) => void;
  value: string[]; toggle: (label: string) => void; disabled?: boolean;
}) {
  const family = emotionTaxonomy[category];
  const detail = family.branches[branch];
  function ring(labels: readonly string[], inner: number, outer: number, active: number, pick: (index: number) => void, level: string) {
    return labels.map((label, index) => {
      const slice = 2 * Math.PI / labels.length;
      const mid = index * slice - Math.PI / 2;
      const [x, y] = point((inner + outer) / 2, mid);
      const checked = value.some(item => item.toLowerCase() === label.toLowerCase());
      const color = inner === 34 ? emotionTaxonomy[index].tone : family.tone;
      const labelWidth = inner === 34 ? 43 : inner === 94 ? 78 : 85;
      return <g role="button" key={label} tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
        aria-label={level + ': ' + label} aria-pressed={inner === 147 ? checked : index === active}
        data-active={index === active || checked} data-selected={checked}
        onClick={() => { if (!disabled) pick(index); }}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!disabled) pick(index);
          }
        }}>
        <path d={segment(inner, outer, mid - slice / 2 + 0.023, mid + slice / 2 - 0.023)} fill={color} />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
          textLength={label.length * 6 > labelWidth ? labelWidth : undefined} lengthAdjust="spacingAndGlyphs">
          {label}
        </text>
      </g>;
    });
  }
  return <div className="emotion-visual">
    <svg viewBox="0 0 430 430" role="group" aria-label="Three-ring emotion wheel" className="emotion-svg">
      <circle cx={center} cy={center} r="29" fill="#344b3b" />
      <text x={center} y={center} textAnchor="middle" dominantBaseline="central" className="emotion-center" aria-hidden>Feel</text>
      {ring(emotionTaxonomy.map(group => group.label), 34, 91, category, setCategory, 'Broad category')}
      {ring(family.branches.map(item => item.label), 94, 144, branch, setBranch, 'Specific emotion')}
      {ring(detail.terms, 147, 210, -1, index => toggle(detail.terms[index]), 'Nuanced emotion')}
    </svg>
    <p className="muted">Choose a category in the inner ring, then a specific emotion in the middle ring. Select a phrase in the outer ring to add it.</p>
    <div className="growth-actions">
      {[family.label, detail.label].map(label => <button className="secondary" type="button" key={label} disabled={disabled}
        aria-pressed={value.includes(label)} onClick={() => toggle(label)}>{value.includes(label) ? 'Remove ' : 'Add '}{label}</button>)}
    </div>
    <ul className="growth-list" aria-label="Outer ring terms">
      {detail.terms.map(label => <li key={label}>
        <button type="button" className="text-button" aria-pressed={value.includes(label)} disabled={disabled}
          onClick={() => toggle(label)}>{value.includes(label) ? '✓ ' : ''}{label}</button>
      </li>)}
    </ul>
  </div>;
}

export function EmotionPicker({ value, onChange, disabled, showWheel = false, quick = false }: Props) {
  const heading = useId();
  const [mode, setMode] = useState<'wheel' | 'list'>(showWheel ? 'wheel' : 'list');
  const [category, setCategory] = useState(0);
  const [branch, setBranch] = useState(0);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const selected = (label: string) => value.some(item => item.toLowerCase() === label.toLowerCase());
  function toggle(label: string) {
    if (selected(label)) onChange(value.filter(item => item.toLowerCase() !== label.toLowerCase()));
    else if (value.length < emotionSlots) onChange([...value, label]);
    else { setError('Choose up to ' + emotionSlots + ' emotions. Remove one to add another.'); return; }
    setError('');
  }
  function checkbox(label: string, path?: string) {
    return <label key={label} className="values-option emotion-option">
      <input type="checkbox" checked={selected(label)} disabled={disabled} onChange={() => toggle(label)} />
      <span>{label}{path && <small>{path}</small>}</span>
    </label>;
  }
  const managed = useGrowthContent('emotion');
  const labels = new Set(emotionVocabulary.map(entry => entry.label.toLowerCase()));
  const vocabulary: { label: string; path: string }[] = [...emotionVocabulary];
  for (const item of managed) {
    const key = item.title.toLowerCase();
    if (emotionLabel.safeParse(item.title).success && !labels.has(key)) {
      labels.add(key);
      vocabulary.push({ label: item.title, path: item.body });
    }
  }
  const results = query.trim() ? vocabulary.filter(({ label, path }) =>
    (label + ' ' + path).toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <div className="emotion-picker" role="group" aria-labelledby={heading}>
    <h3 id={heading}>Explore emotions</h3>
    <p className="muted">Choose any words that fit. More than one can be true at the same time.</p>
    <div className="growth-actions">
      <button type="button" className="secondary" aria-pressed={mode === 'wheel'} onClick={() => setMode('wheel')}>Wheel view</button>
      <button type="button" className="secondary" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>List view</button>
    </div>
    {quick && <div className="emotion-options" aria-label="Quick emotions">{quickEmotions.map(label => checkbox(label))}</div>}
    {mode === 'wheel' && <Wheel category={category} branch={branch} setCategory={index => { setCategory(index); setBranch(0); }}
      setBranch={setBranch} value={value} toggle={toggle} disabled={disabled} />}
    <label className="values-label">Search emotion vocabulary<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {query.trim() ? <>
      <p role="status">{results.length} matches</p>
      <div className="emotion-options">{results.map(({ label, path }) => checkbox(label, path))}</div>
    </> : mode === 'list' && <div className="emotion-categories">{emotionTaxonomy.map(group => <details key={group.label}>
      <summary>{group.label}</summary>
      <div className="emotion-options">{checkbox(group.label, 'Broad category')}</div>
      {group.branches.map(item => <details key={item.label}>
        <summary>{item.label}</summary>
        <div className="emotion-options">{checkbox(item.label, 'Specific emotion')}{item.terms.map(label => checkbox(label))}</div>
      </details>)}
    </details>)}</div>}
    <div className="growth-actions">
      <label className="values-label">Custom emotion<input value={custom} maxLength={60} disabled={disabled} onChange={event => setCustom(event.target.value)} /></label>
      <button type="button" className="secondary" disabled={disabled || !custom.trim()} onClick={() => {
        const parsed = emotionLabel.safeParse(custom);
        if (!parsed.success) return;
        if (selected(parsed.data)) { setError('That emotion is already selected.'); return; }
        toggle(parsed.data);
        if (value.length < emotionSlots) setCustom('');
      }}>Add custom emotion</button>
    </div>
    <p role="status">{value.length ? value.length + ' selected' : 'No emotions selected'}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {value.length > 0 && <ul className="emotion-chips" aria-label="Selected emotions">{value.map(label => <li key={label}>
      <button type="button" className="secondary" disabled={disabled} aria-label={'Remove selected emotion ' + label} onClick={() => toggle(label)}>{label} ×</button>
    </li>)}</ul>}
  </div>;
}
