import type { StudioData, WorkbookLink } from '../lib/model';
import { saveMilestone } from '../lib/personal/actions';
import { activityLabels, goalProgress } from '../lib/personal/shared';
import { save } from '../lib/actions';
import { StudioForm } from './forms';
import { JournalHistory } from './journal-history';
import { JournalEditor } from './journal-editor';
import { Heading, Meter } from './studio';
import { WorkbookConnection } from './workbook-connection';

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' });

export function Journal({ data, reflection, links, attached }: {
  data: StudioData; reflection?: string; links: WorkbookLink[]; attached?: string;
}) {
  const selected = links.find(link => link.ref === attached)?.ref;
  return <>
    <Heading title="Your journal" subtitle="A private place to put your thoughts into words." />
    <section id="new-entry" className="panel form-panel">
      <h2>New entry</h2>
      {reflection && <p className="journal-prompt">{reflection}</p>}
      <JournalEditor key={selected ?? 'new'} draftId={crypto.randomUUID()} links={links} attached={selected} />
    </section>
    <JournalHistory entries={data.journal} links={links} />
  </>;
}

export function Goals({ data, links, attached }: { data: StudioData; links: WorkbookLink[]; attached?: string }) {
  const selected = links.find(link => link.ref === attached)?.ref;
  return <>
    <Heading title="Your goals" subtitle="Choose what matters to you and give it a next step." />
    <section className="panel form-panel">
      <h2>Set a goal</h2>
      <StudioForm key={selected ?? 'new'} action={save.bind(null, 'goal')} className="stack">
        <label>Goal<input name="title" required maxLength={140} /></label>
        <label>Target date (optional)<input name="date" type="date" /></label>
        <WorkbookConnection label="Workbook exercise (optional)" links={links} value={selected} />
        <button className="primary">Add goal</button>
      </StudioForm>
    </section>
    <section className="dashboard-section stack" aria-labelledby="saved-goals-title">
      <h2 id="saved-goals-title">Saved goals</h2>
      {!data.goals.length && <p className="panel empty">Your goals will appear here.</p>}
      {data.goals.map(goal => {
        const milestones = (data.milestones ?? []).filter(item => item.goal_id === goal.id);
        const history = (data.activity ?? []).filter(item => item.goal_id === goal.id);
        const { done, percent } = goalProgress(goal, milestones);
        return <details className="panel form-panel" key={goal.id}>
          <summary><strong>{goal.title}</strong> <span>{goal.completed ? 'Completed' : 'In progress'}{goal.target_date ? ' · ' + goal.target_date : ''}</span></summary>
          <div className="stack edit">
            <StudioForm action={save.bind(null, 'goal')} className="stack">
              <input type="hidden" name="id" value={goal.id} />
              <input type="hidden" name="completed" value={String(!goal.completed)} />
              <label>Goal<input name="title" defaultValue={goal.title} required maxLength={140} /></label>
              <label>Target date (optional)<input name="date" type="date" defaultValue={goal.target_date ?? ''} /></label>
              <WorkbookConnection label="Workbook exercise (optional)" links={links} value={goal.workbook_ref} />
              <div className="actions"><button className="primary">Update goal</button><button name="intent" value="toggle" className="secondary" formNoValidate>{goal.completed ? 'Reopen goal' : 'Complete goal'}</button><button name="intent" value="delete" className="secondary" formNoValidate>Delete goal</button></div>
            </StudioForm>
            <section className="milestone-panel stack" aria-label={goal.title + ' milestones'}>
              <div>
                <h3>Milestones</h3>
                <p>{done} of {milestones.length} milestones complete</p>
                <Meter percent={percent} label={goal.title + ' milestone progress'} />
              </div>
              {milestones.map(item => <StudioForm key={item.id} action={saveMilestone.bind(null, goal.id)} className="milestone-row">
                <input name="id" type="hidden" value={item.id} />
                <input name="completed" type="hidden" value={String(!item.completed)} />
                <div className="milestone-controls">
                  <label><span className="sr-only">Milestone {item.title}</span><input name="title" key={item.title} defaultValue={item.title} required maxLength={140} /></label>
                  <button type="submit" name="intent" value="toggle" className="secondary" formNoValidate aria-label={(item.completed ? 'Reopen ' : 'Complete ') + item.title}>
                    {item.completed ? 'Reopen' : 'Complete'}
                  </button>
                  <button type="submit" name="intent" value="edit" className="secondary">Save</button>
                  <button type="submit" name="intent" value="delete" className="secondary" formNoValidate aria-label={'Remove ' + item.title}>Remove</button>
                </div>
              </StudioForm>)}
              <StudioForm action={saveMilestone.bind(null, goal.id)} className="stack">
                <label>New milestone<input name="title" required maxLength={140} /></label>
                <button name="intent" value="add" className="primary">Add milestone</button>
              </StudioForm>
            </section>
            <section className="milestone-panel" aria-label={goal.title + ' activity'}>
              <h3>Progress history</h3>
              {history.length ? <ol className="goal-history">{history.map(event => <li key={event.id}>
                <time dateTime={event.created_at}>{dateTime.format(new Date(event.created_at))}</time>
                <span>{activityLabels[event.kind]} · {event.title}</span>
              </li>)}</ol> : <p className="muted">Goal and milestone changes will appear here.</p>}
            </section>
          </div>
        </details>;
      })}
    </section>
  </>;
}
