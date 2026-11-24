'use client';

import { useState } from 'react';
import type { BodyRegion } from '../lib/becoming/body';

type View = 'Front' | 'Back';
type Shape = { region: BodyRegion; path: string; mirrored?: boolean; view?: View };

// The neutral silhouette is drawn as adjacent region shapes on a 200 × 460 grid.
const shapes: Shape[] = [
  { region: 'Head', path: 'M76 38 Q76 10 100 9 Q124 10 124 38 L121 49 Q100 57 79 49 Z' },
  { region: 'Jaw', view: 'Front', path: 'M79 49 Q100 57 121 49 Q116 67 108 70 H92 Q84 67 79 49 Z' },
  { region: 'Head', view: 'Back', path: 'M79 49 Q100 57 121 49 Q116 67 108 70 H92 Q84 67 79 49 Z' },
  { region: 'Neck', path: 'M92 70 H108 Q108 82 117 86 L111 99 H89 L83 86 Q92 82 92 70 Z' },
  { region: 'Shoulders', mirrored: true, path: 'M83 86 L89 99 L71 116 L54 115 Q54 93 83 86 Z' },
  { region: 'Chest', view: 'Front', path: 'M89 99 H111 L129 116 L124 155 Q100 162 76 155 L71 116 Z' },
  { region: 'Upper back', view: 'Back', path: 'M89 99 H111 L129 116 L124 155 Q100 162 76 155 L71 116 Z' },
  { region: 'Abdomen', view: 'Front', path: 'M76 155 Q100 162 124 155 Q121 173 131 199 Q100 207 69 199 Q79 173 76 155 Z' },
  { region: 'Lower back', view: 'Back', path: 'M76 155 Q100 162 124 155 Q121 173 131 199 Q100 207 69 199 Q79 173 76 155 Z' },
  { region: 'Arms', mirrored: true, path: 'M54 115 L71 116 L65 151 L55 185 L47 221 L32 218 L36 183 L44 146 Z' },
  { region: 'Hands', mirrored: true, path: 'M32 218 L47 221 Q50 230 48 239 Q45 243 42 237 L38 251 Q34 258 27 251 L27 234 Z' },
  { region: 'Hips', path: 'M69 199 Q100 207 131 199 Q137 219 135 238 H65 Q63 219 69 199 Z' },
  { region: 'Legs', mirrored: true, path: 'M65 238 H100 L95 293 L89 337 L83 387 L78 417 L60 416 L61 386 L62 341 L61 288 Q60 259 65 238 Z' },
  { region: 'Feet', mirrored: true, path: 'M60 416 L78 417 L78 435 Q77 446 55 446 Q48 445 50 439 Z' },
];

const views = ['Front', 'Back'] as const;

export function BodyOutline({ selected, onChange }: { selected: readonly BodyRegion[]; onChange?: (region: BodyRegion) => void }) {
  const [view, setView] = useState<View>('Front');
  const visible = shapes.filter(shape => !shape.view || shape.view === view);
  const regions = [...new Set(visible.map(shape => shape.region))];
  return <div className="body-diagram">
    <div className="growth-actions" role="group" aria-label="Body view">
      {views.map(item => <button className="secondary" key={item} type="button" aria-pressed={view === item}
        onClick={() => setView(item)}>{item}</button>)}
    </div>
    <svg className="body-outline" viewBox="0 0 200 460" role={onChange ? 'group' : 'img'}
      aria-label={view + (onChange ? ' body region selector' : ' body outline showing recorded regions')}>
      {regions.map(region => {
        const active = selected.includes(region);
        return <g key={region} data-selected={active || undefined}
          role={onChange ? 'button' : undefined} tabIndex={onChange ? 0 : undefined}
          aria-label={onChange ? region : undefined} aria-pressed={onChange ? active : undefined}
          onClick={onChange ? () => onChange(region) : undefined}
          onKeyDown={onChange ? event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onChange(region);
            }
          } : undefined}>
          {visible.filter(shape => shape.region === region).map(({ path, mirrored }) => <g key={path}>
            <path d={path} />
            {mirrored && <path d={path} transform="translate(200 0) scale(-1 1)" />}
          </g>)}
        </g>;
      })}
      {view === 'Front' && <path className="body-orientation" d="M88 42h4m16 0h4m-13 1-2 7h5m-6 12q4 2 8 0" aria-hidden />}
      {view === 'Back' && <path className="body-orientation" d="M100 107v43m0 15v27" aria-hidden />}
    </svg>
    <p className="muted">{view === 'Front' ? 'Upper and lower back are on the back view.' : 'Jaw, chest, and abdomen are on the front view.'}</p>
  </div>;
}
