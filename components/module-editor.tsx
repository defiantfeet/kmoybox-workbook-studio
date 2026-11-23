'use client';

import { useActionState, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { saveModuleDraft } from '../lib/workbooks/actions';
import { moduleSchema, type Block, type ModuleContent } from '../lib/workbooks/schema';
import { WorkbookBlocks } from './workbook-blocks';

const blockLabels: Record<Block['kind'], string> = {
  lesson: 'Written lesson', reflection: 'Short-answer reflection', choice: 'Multiple choice',
  rating: 'Rating scale', goal: 'Goal-setting exercise',
};

function newBlock(kind: Block['kind']): Block {
  const id = crypto.randomUUID();
  switch (kind) {
    case 'lesson': return { id, kind, body: '' };
    case 'choice': return { id, kind, prompt: '', options: [
      { id: crypto.randomUUID(), label: '' }, { id: crypto.randomUUID(), label: '' },
    ] };
    case 'rating': return { id, kind, prompt: '', max: 5, low: '', high: '' };
    case 'reflection': return { id, kind, prompt: '' };
    case 'goal': return { id, kind, prompt: '' };
  }
}

export function ModuleEditor({ slug, id, version, initial }: {
  slug: string; id: string | null; version: number; initial: ModuleContent;
}) {
  const [content, setContent] = useState(initial);
  const [kind, setKind] = useState<Block['kind']>('lesson');
  const [preview, setPreview] = useState<ModuleContent | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [result, submit, pending] = useActionState(() => saveModuleDraft(slug, id, version, content), { message: '' });

  function patch<K extends keyof ModuleContent>(key: K, value: ModuleContent[K]) {
    setContent(current => ({ ...current, [key]: value }));
    setPreview(null);
    setPreviewError('');
  }

  function updateBlock(id: string, replacement: Block) {
    patch('blocks', content.blocks.map(item => item.id === id ? replacement : item));
  }

  function move(index: number, offset: number) {
    const blocks = [...content.blocks];
    const [item] = blocks.splice(index, 1);
    blocks.splice(index + offset, 0, item);
    patch('blocks', blocks);
  }

  function showPreview() {
    const parsed = moduleSchema.safeParse(content);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setPreviewError(issue.path.join(' · ') + ': ' + issue.message);
      return;
    }
    setPreviewError('');
    setPreview(parsed.data);
  }

  return <>
    <form action={submit} className="stack">
      <fieldset disabled={pending}>
        <div className="editor-fields">
          <label>Module title<input required maxLength={120} value={content.title} onChange={event => patch('title', event.target.value)} /></label>
          <label>Chapter title<input required maxLength={120} list="workbook-chapters" value={content.chapter} onChange={event => patch('chapter', event.target.value)} /></label>
          <label>Chapter order<input type="number" min={1} max={999} required value={content.chapterOrder || ''} onChange={event => patch('chapterOrder', Number(event.target.value))} /></label>
          <label>Module order<input type="number" min={1} max={999} required value={content.order || ''} onChange={event => patch('order', Number(event.target.value))} /></label>
        </div>
        <div className="stack">
          {content.blocks.map((block, index) => <fieldset key={block.id} className="editor-block">
            <legend>{index + 1}. {blockLabels[block.kind]}</legend>
            <div className="actions editor-tools">
              <button type="button" className="secondary" aria-label={'Move block ' + (index + 1) + ' up'} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden /></button>
              <button type="button" className="secondary" aria-label={'Move block ' + (index + 1) + ' down'} disabled={index === content.blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden /></button>
              <button type="button" className="secondary" aria-label={'Remove block ' + (index + 1)} onClick={() => patch('blocks', content.blocks.filter(item => item.id !== block.id))}><X size={16} aria-hidden /></button>
            </div>
            {block.kind === 'lesson'
              ? <label>Lesson text<textarea required maxLength={6000} rows={5} value={block.body} onChange={event => updateBlock(block.id, { ...block, body: event.target.value })} /></label>
              : <label>Question or prompt<textarea required maxLength={600} rows={2} value={block.prompt} onChange={event => updateBlock(block.id, { ...block, prompt: event.target.value })} /></label>}
            {block.kind === 'choice' && <div className="stack">
              {block.options.map((option, optionIndex) => <div className="editor-option" key={option.id}>
                <label>Option {optionIndex + 1}<input required maxLength={120} value={option.label} onChange={event =>
                  updateBlock(block.id, { ...block, options: block.options.map(item => item.id === option.id ? { ...item, label: event.target.value } : item) })} /></label>
                <button type="button" className="secondary" disabled={block.options.length <= 2} aria-label={'Remove option ' + (optionIndex + 1)} onClick={() =>
                  updateBlock(block.id, { ...block, options: block.options.filter(item => item.id !== option.id) })}><X size={16} aria-hidden /></button>
              </div>)}
              <button type="button" className="secondary" disabled={block.options.length >= 8} onClick={() =>
                updateBlock(block.id, { ...block, options: [...block.options, { id: crypto.randomUUID(), label: '' }] })}>Add option</button>
            </div>}
            {block.kind === 'rating' && <div className="editor-fields">
              <label>Highest rating<input type="number" required min={2} max={10} value={block.max || ''} onChange={event => updateBlock(block.id, { ...block, max: Number(event.target.value) })} /></label>
              <label>Low label<input required maxLength={120} value={block.low} onChange={event => updateBlock(block.id, { ...block, low: event.target.value })} /></label>
              <label>High label<input required maxLength={120} value={block.high} onChange={event => updateBlock(block.id, { ...block, high: event.target.value })} /></label>
            </div>}
          </fieldset>)}
          <div className="editor-option">
            <label>Block type<select value={kind} onChange={event => setKind(event.target.value as Block['kind'])}>
              {Object.entries(blockLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <button type="button" className="secondary" disabled={content.blocks.length >= 24} onClick={() => patch('blocks', [...content.blocks, newBlock(kind)])}><Plus size={16} aria-hidden /> Add block</button>
          </div>
        </div>
        <div className="actions">
          <button className="primary" type="submit">Save draft</button>
          <button className="secondary" type="button" onClick={showPreview}>Preview module</button>
        </div>
      </fieldset>
      {result.message && <p className="error" role="alert">{result.message}</p>}
      {previewError && <p className="error" role="alert">{previewError}</p>}
    </form>
    {preview && <section className="editor-preview" aria-labelledby="module-preview">
      <h3 id="module-preview">Module preview</h3>
      <p className="eyebrow">{preview.chapter}</p>
      <h4 className="preview-title">{preview.title}</h4>
      <fieldset disabled aria-label="Read-only module preview"><WorkbookBlocks content={preview} /></fieldset>
    </section>}
  </>;
}
