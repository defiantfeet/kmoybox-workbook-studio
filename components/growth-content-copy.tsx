import { contentKinds, type ContentCopy, type ContentKind, type PublishedContent } from '../lib/becoming/content-catalog';

export function GrowthContentCopy({ copy, kind }: { copy: ContentCopy; kind: ContentKind }) {
  return <article className="growth-content-copy">
    <h3>{copy.title}</h3>
    <p className="muted">{copy.category || contentKinds[kind]}</p>
    {copy.body && <p className="growth-note">{copy.body}</p>}
    {kind === 'availability' && <p>{copy.available ? 'Module available' : 'Module unavailable'}</p>}
  </article>;
}

export function GrowthContentLibrary({ items }: { items: PublishedContent[] }) {
  if (!items.length) return null;
  return <section className="panel growth-panel" aria-labelledby="published-growth-heading">
    <h2 id="published-growth-heading">Additional growth resources</h2>
    <div className="growth-list">{items.map(item => <GrowthContentCopy key={item.item_id} copy={item} kind={item.kind} />)}</div>
  </section>;
}
