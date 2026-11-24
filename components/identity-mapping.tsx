'use client';

import Link from 'next/link';
import { useState } from 'react';
import { saveIdentity, sendIdentityPractice } from '../lib/becoming/identity-actions';
import {
  compareIdentity, identityActivities, identityCategories, identityClassifications, identityPrompts,
  maxIdentityConnections, maxIdentityNodes, type IdentityMapData, type IdentityNode, type IdentityVersion,
} from '../lib/becoming/identity';
import { StudioForm } from './forms';

type Point = { x: number; y: number };
type Props = {
  map: IdentityMapData; versions: IdentityVersion[]; coreValues: string[];
  id: string; revision: string; timezone: string; preview: boolean;
};

function Line({ from, to, joined }: { from: Point; to: Point; joined?: boolean }) {
  const x = to.x - from.x;
  const y = to.y - from.y;
  return <i aria-hidden className="identity-line" data-joined={joined} style={{
    left: from.x + '%', top: from.y + '%', width: Math.hypot(x, y) + '%', rotate: Math.atan2(y, x) + 'rad',
  }} />;
}

function IdentityGraph({ map, selected, pick }: { map: IdentityMapData; selected: string; pick: (id: string) => void }) {
  const points = new Map(map.nodes.map((node, index) => {
    const angle = 2 * Math.PI * index / map.nodes.length - Math.PI / 2;
    return [node.id, { x: 50 + 42 * Math.cos(angle), y: 50 + 42 * Math.sin(angle) }];
  }));
  return <div className="identity-graph" role="group" aria-label="Visual identity map">
    <div className="identity-center">Me</div>
    {map.nodes.map(node => <Line key={node.id} from={{ x: 50, y: 50 }} to={points.get(node.id)!} />)}
    {map.connections.map(([a, b]) => <Line key={a + b} from={points.get(a)!} to={points.get(b)!} joined />)}
    {map.nodes.map((node, index) => {
      const point = points.get(node.id)!;
      return <button key={node.id} type="button" className="identity-dot" style={{ left: point.x + '%', top: point.y + '%' }}
        aria-label={'Map node ' + (index + 1) + ': ' + (node.label.trim() || 'Unnamed node')} title={node.label}
        aria-pressed={selected === node.id} onClick={() => pick(node.id)}>{index + 1}</button>;
    })}
  </div>;
}

function describe(node: IdentityNode) {
  return [node.label || 'Unnamed node', node.category, node.classification].filter(Boolean).join(' · ');
}

function IdentityHistory({ versions, timezone }: Pick<Props, 'versions' | 'timezone'>) {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const first = versions.find(entry => entry.id === left) ?? versions[0];
  const second = versions.find(entry => entry.id === right) ?? versions[1];
  const dates = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium' });
  const changes = first && second ? compareIdentity(first.map, second.map) : null;
  const options = versions.map((version, index) => <option key={version.id} value={version.id}>
    Version {versions.length - index} · {dates.format(new Date(version.savedAt))}
  </option>);

  return <section className="panel growth-panel" aria-labelledby="identity-history">
    <h2 id="identity-history">Compare dated versions</h2>
    {!first ? <p className="muted">Save a dated version to start a history of your map.</p> : <>
      <div className="identity-actions">
        <label className="values-label">Version<select value={first.id} onChange={event => setLeft(event.target.value)}>
          {options}
        </select></label>
        {second && <label className="values-label">Compare with<select value={second.id} onChange={event => setRight(event.target.value)}>
          {options}
        </select></label>}
      </div>
      <details>
        <summary>View selected version</summary>
        {first.map.nodes.length > 0 ? <ul className="growth-list">{first.map.nodes.map(node => <li key={node.id}>{describe(node)}</li>)}</ul> : <p>No nodes saved.</p>}
        {!!first.map.connections.length && <ul className="growth-list" aria-label="Saved connections">
          {first.map.connections.map(([a, b]) => <li key={a + b}>{first.map.nodes.find(node => node.id === a)?.label} and {first.map.nodes.find(node => node.id === b)?.label}</li>)}
        </ul>}
        {identityPrompts.map(([key, prompt]) => first.map.reflections[key] && <p className="growth-note" key={key}><strong>{prompt}</strong><br />{first.map.reflections[key]}</p>)}
        {first.map.earlier?.map((note, index) => <p key={index} className="growth-note">{note}</p>)}
      </details>
      {changes && <div className="identity-differences">
        <h3>Changes in selected version</h3>
        <dl>
          <dt>Nodes added</dt><dd>{changes.added.join(', ') || 'None'}</dd>
          <dt>Nodes removed</dt><dd>{changes.removed.join(', ') || 'None'}</dd>
          <dt>Nodes edited</dt><dd>{changes.changed.length ? <ul>{changes.changed.map(({ before, after }) =>
            <li key={after.id}>{describe(before)} → {describe(after)}</li>)}</ul> : 'None'}</dd>
          <dt>Connections added</dt><dd>{changes.connected.join(', ') || 'None'}</dd>
          <dt>Connections removed</dt><dd>{changes.disconnected.join(', ') || 'None'}</dd>
          <dt>Reflection changes</dt><dd>{changes.reflections.length ? <ul>{changes.reflections.map(([key, prompt]) =>
            <li key={key}><details><summary>{prompt}</summary>
              <p className="growth-note"><strong>Comparison version</strong><br />{second.map.reflections[key] || 'No response saved.'}</p>
              <p className="growth-note"><strong>Selected version</strong><br />{first.map.reflections[key] || 'No response saved.'}</p>
            </details></li>)}</ul> : 'None'}</dd>
        </dl>
      </div>}
      {!second && <p className="muted">Save a second version to see what changed.</p>}
    </>}
  </section>;
}

export function IdentityMapping({ map: initial, versions, coreValues, id, revision, timezone, preview }: Props) {
  const [map, setMap] = useState(initial);
  const [selected, setSelected] = useState(initial.nodes[0]?.id ?? '');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [value, setValue] = useState('');
  const [target, setTarget] = useState('');
  const [step, setStep] = useState('');
  const [practice, setPractice] = useState<keyof typeof identityActivities>('boundary');
  const active = map.nodes.find(node => node.id === selected);
  const candidates = active ? map.nodes.filter(node => node.id !== active.id &&
    !map.connections.some(edge => edge.includes(node.id) && edge.includes(active.id))) : [];
  const connected = new Set(map.connections.filter(edge => edge.includes(selected)).flat().filter(id => id !== selected));

  function pick(id: string) {
    setSelected(id);
    setTarget('');
  }

  function createNode(label: string, category: IdentityNode['category'] = '') {
    if (map.nodes.length >= maxIdentityNodes) return;
    const node: IdentityNode = { id: crypto.randomUUID(), label, category, classification: '' };
    setMap(old => ({ ...old, nodes: [...old.nodes, node] }));
    pick(node.id);
  }

  function updateNode(update: Partial<IdentityNode>) {
    setMap(old => ({ ...old, nodes: old.nodes.map(node => node.id === selected ? { ...node, ...update } : node) }));
  }

  function removeNode() {
    const remaining = map.nodes.filter(node => node.id !== selected);
    setMap({ ...map, nodes: remaining, connections: map.connections.filter(edge => !edge.includes(selected)) });
    pick(remaining[0]?.id ?? '');
  }

  function connectNode() {
    if (!candidates.some(node => node.id === target) || map.connections.length >= maxIdentityConnections) return;
    const edge: [string, string] = selected < target ? [selected, target] : [target, selected];
    setMap(old => ({ ...old, connections: [...old.connections, edge] }));
    setTarget('');
  }

  return <>
    <section className="panel growth-panel" aria-labelledby="identity-editor">
      <h2 id="identity-editor">Your identity map</h2>
      <p>Start with a role, interest, or word that feels relevant today. You can skip categories, classifications, and reflections.</p>
      <StudioForm action={saveIdentity} className="identity-form">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="revision" value={revision} />
        <input type="hidden" name="map" value={JSON.stringify(map)} />
        <div className="identity-actions" role="group" aria-label="Map view">
          <button type="button" className="secondary" aria-pressed={view === 'map'} onClick={() => setView('map')}>Visual map</button>
          <button type="button" className="secondary" aria-pressed={view === 'list'} onClick={() => setView('list')}>List view</button>
          <button type="button" className="primary" disabled={map.nodes.length >= maxIdentityNodes} onClick={() => createNode('')}>Add node</button>
        </div>
        {map.nodes.length >= maxIdentityNodes && <p className="muted">This map has reached its limit of {maxIdentityNodes} nodes.</p>}
        <div className={view === 'map' ? 'identity-layout' : undefined}>
          {view === 'map' && <IdentityGraph map={map} selected={selected} pick={pick} />}
          <div>
            {map.nodes.length ? <ol className="identity-list" aria-label="Identity nodes">{map.nodes.map(node => <li key={node.id}>
              <button type="button" className="text-button" aria-pressed={node.id === selected} onClick={() => pick(node.id)}>{node.label.trim() || 'Unnamed node'}</button>
              {view === 'list' && <span>{[node.category, node.classification].filter(Boolean).join(' · ')}</span>}
            </li>)}</ol> : <p className="muted">Add your first node to start the map.</p>}
            {active && <fieldset className="identity-node-fields">
              <legend>Edit selected node</legend>
              <label className="values-label">Node name<input value={active.label} maxLength={80} onChange={event => updateNode({ label: event.target.value })} /></label>
              <label className="values-label">Category (optional)<select value={active.category}
                onChange={event => updateNode({ category: event.target.value as IdentityNode['category'] })}>
                <option value="">Choose a category</option>{identityCategories.map(item => <option key={item}>{item}</option>)}
              </select></label>
              <label className="values-label">Classification (optional)<select value={active.classification}
                onChange={event => updateNode({ classification: event.target.value as IdentityNode['classification'] })}>
                <option value="">Choose a classification</option>{identityClassifications.map(item => <option key={item}>{item}</option>)}
              </select></label>
              <h3>Connections</h3>
              {connected.size ? <ul className="growth-list">{map.nodes.filter(node => connected.has(node.id)).map(node => <li key={node.id}>
                {node.label || 'Unnamed node'} <button type="button" className="text-button" aria-label={'Disconnect ' + (node.label || 'unnamed node')}
                  onClick={() => setMap(old => ({ ...old, connections: old.connections.filter(edge => !(edge.includes(node.id) && edge.includes(selected))) }))}>Disconnect</button>
              </li>)}</ul> : <p className="muted">This node has no connections.</p>}
              {map.connections.length >= maxIdentityConnections && <p className="muted">This map has reached its limit of {maxIdentityConnections} connections.</p>}
              {!!candidates.length && <div className="identity-actions">
                <label className="values-label">Connect to<select value={target} onChange={event => setTarget(event.target.value)}>
                  <option value="">Choose another node</option>
                  {candidates.map(node => <option value={node.id} key={node.id}>{node.label || 'Unnamed node'}</option>)}
                </select></label>
                <button type="button" className="secondary" disabled={!target || map.connections.length >= maxIdentityConnections} onClick={connectNode}>Connect nodes</button>
              </div>}
              <button type="button" className="text-button" onClick={removeNode}>Remove node</button>
            </fieldset>}
          </div>
        </div>
        <details className="values-section">
          <summary>Optional reflections</summary>
          {identityPrompts.map(([key, prompt]) => <label className="values-label" key={key}>{prompt}
            <textarea rows={2} maxLength={2000} value={map.reflections[key] ?? ''} onChange={event => {
              const text = event.target.value;
              setMap(old => ({ ...old, reflections: { ...old.reflections, [key]: text } }));
            }} />
          </label>)}
          {map.earlier?.map((note, index) => <p key={index} className="growth-note">{note}</p>)}
        </details>
        <div className="identity-actions">
          <button className="secondary" name="intent" value="draft" disabled={preview}>Save draft</button>
          <button className="primary" name="intent" value="version" disabled={preview}>Save dated version</button>
        </div>
      </StudioForm>
    </section>

    <section className="panel growth-panel" aria-labelledby="identity-practice">
      <h2 id="identity-practice">Connect your map to other growth work</h2>
      <Link className="text-button" href="/becoming/values-assessment">Open Values Assessment</Link>
      {coreValues.length > 0 ? <div className="identity-actions">
        <label className="values-label">Core value<select value={value} onChange={event => setValue(event.target.value)}>
          <option value="">Choose a value</option>{coreValues.map(item => <option key={item}>{item}</option>)}
        </select></label>
        <button className="secondary" type="button" disabled={!value || map.nodes.length >= maxIdentityNodes}
          onClick={() => { createNode(value, 'Personal values'); setValue(''); }}>Add value as a node</button>
      </div> : <p className="muted">Complete a Values Assessment to choose a core value to add to your map.</p>}
      <p>You can create a separate practice draft using a next step you write here. Your map and reflections stay in this module.</p>
      <StudioForm action={sendIdentityPractice} className="stack identity-form">
        <label className="values-label">Related exercise<select name="kind" value={practice} onChange={event => setPractice(event.target.value as typeof practice)}>
          {Object.entries(identityActivities).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
        </select></label>
        <label className="values-label">{identityActivities[practice].prompt}<textarea name="step" rows={2} maxLength={500} value={step} onChange={event => setStep(event.target.value)} required /></label>
        <button className="secondary" disabled={preview}>Create practice draft</button>
      </StudioForm>
      <div className="identity-actions">{Object.values(identityActivities).map(item =>
        <Link key={item.slug} className="text-button" href={'/becoming/' + item.slug}>Open {item.label}</Link>)}</div>
    </section>
    <IdentityHistory versions={versions} timezone={timezone} />
  </>;
}
