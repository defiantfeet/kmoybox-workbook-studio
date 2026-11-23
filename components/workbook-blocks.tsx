import type { AnswerValue, ModuleContent } from '../lib/workbooks/schema';

export function WorkbookBlocks({ content, answers = {} }: {
  content: ModuleContent;
  answers?: Record<string, AnswerValue>;
}) {
  return <div className="module-blocks">
    {content.blocks.map(block => {
      const answer = answers[block.id];
      const selected = typeof answer === 'string' ? answer : '';
      if (block.kind === 'lesson') {
        return <div className="module-lesson" key={block.id}>{block.body.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
      }
      if (block.kind === 'reflection') {
        return <label key={block.id}>{block.prompt}<textarea name={block.id} rows={4} maxLength={2000} defaultValue={selected} /></label>;
      }
      if (block.kind === 'goal') {
        const goal = typeof answer === 'object' && answer !== null ? answer : undefined;
        return <fieldset className="exercise-options" key={block.id}>
          <legend>{block.prompt}</legend>
          <label>My goal<input name={block.id + '.goal'} maxLength={500} defaultValue={goal?.goal} /></label>
          <label>My first step<input name={block.id + '.step'} maxLength={500} defaultValue={goal?.step} /></label>
          <label>Target date (optional)<input type="date" name={block.id + '.date'} defaultValue={goal?.date} /></label>
        </fieldset>;
      }
      const options = block.kind === 'choice' ? block.options
        : Array.from({ length: block.max }, (_, index) => ({ id: String(index + 1), label: String(index + 1) }));
      return <fieldset className="exercise-options" key={block.id}>
        <legend>{block.prompt}</legend>
        {block.kind === 'rating' && <p className="muted">1 – {block.low} · {block.max} – {block.high}</p>}
        <div className={block.kind === 'rating' ? 'rating-options' : 'choice-options'}>
          {options.map(option => <label key={option.id}>
            <input type="radio" name={block.id} value={option.id} defaultChecked={selected === option.id} />
            <span>{option.label}</span>
          </label>)}
        </div>
      </fieldset>;
    })}
  </div>;
}
