import { GrowthContentContext } from '../../../components/growth-content-context';
import { GrowthContentLibrary } from '../../../components/growth-content-copy';
import { contentFor, moduleAvailable } from '../../../lib/becoming/content-catalog';
import { publishedGrowthContent } from '../../../lib/becoming/content-data';
import { z } from 'zod';
import { centralRemindersActive } from '../../../lib/becoming/reminder-data';
import { connectedExercise, connectedMoodEmotions, connectionEmotionLabels } from '../../../lib/becoming/insight-connections';
import { MoodTracker } from '../../../components/mood-tracker';
import { moodSlots } from '../../../lib/becoming/mood';
import { HabitTracker } from '../../../components/habit-tracker';
import { addDays, habitRange } from '../../../lib/becoming/habits';
import { LifeTimeline } from '../../../components/life-timeline';
import { FutureSelf } from '../../../components/future-self';
import { BodyAwareness } from '../../../components/body-awareness';
import { SocialIntegration } from '../../../components/social-integration';
import { socialSection, socialTitle } from '../../../lib/becoming/social';
import { RelationshipInventory } from '../../../components/relationship-inventory';
import { BoundaryBuilder } from '../../../components/boundary-builder';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckIns, GrowthPreview } from '../../../components/becoming';
import { ValuesAssessment } from '../../../components/values-assessment';
import { WheelOfLife } from '../../../components/wheel-of-life';
import { EmotionalWheel } from '../../../components/emotional-wheel';
import { emotionPickerModules } from '../../../lib/becoming/emotions';
import { InnerCriticDialogue } from '../../../components/inner-critic-dialogue';
import { CognitiveReframing } from '../../../components/cognitive-reframing';
import { ThoughtRecord } from '../../../components/thought-record';
import { IdentityMapping } from '../../../components/identity-mapping';
import { GrowthFields } from '../../../components/growth-fields';
import { Heading, Shell } from '../../../components/studio';
import { saveExercise } from '../../../lib/becoming/actions';
import { findModule } from '../../../lib/becoming/catalog';
import { growthAccount, growthDates, growthExercise, growthExerciseHistory, growthHabits, habitOptions, growthMoodHistory, growthTimezones, advancedMoodModule, boundaryModule, bodyModule, emotionModule, futureModule, identityModule, innerCriticModule, reframingModule, relationshipModule, socialModule, thoughtModule, timelineModule, valuesModule, wheelModule } from '../../../lib/becoming/data';
import { demo } from '../../../lib/session';

export default async function ModulePage({ params, searchParams }: {
  params: Promise<{ module: string }>; searchParams: Promise<{ historyPage?: string | string[]; boundaryId?: string; relationshipId?: string; observation?: string; entry?: string; event?: string; deleted?: string; section?: string; view?: string; day?: string; source?: string; milestone?: string; relationship?: string; moodEntry?: string; emotionalEntry?: string; slot?: string; edit?: string; saved?: string }>;
}) {
  const { client, owner, name, timezone } = await growthAccount();
  const module = findModule((await params).module);
  if (!module) notFound();
  const published = await publishedGrowthContent(client);
  if (!moduleAvailable(published, module.slug)) return <Shell current="becoming" name={name} sample={demo}>
    <Link className="text-button growth-back" href="/becoming">Back to Personal Growth</Link>
    <Heading title={module.title} subtitle="This module is currently unavailable. Saved records remain available through your personal data export." />
  </Shell>;
  const resources = contentFor(published, module.slug);
  const { today, monday } = growthDates(timezone);

  let content;
  if (module.slug === 'life-timeline') {
    const query = await searchParams;
    const id = z.uuid().safeParse(query.event);
    if (query.event && !id.success) notFound();
    const data = await timelineModule(client, owner);
    const selected = data.records.find(event => event.id === id.data);
    if (id.success && !selected) notFound();
    content = <LifeTimeline key={selected?.revision ?? 'new'} {...data} selected={selected} timezone={timezone}
      preview={demo} saved={query.saved === '1' && Boolean(selected)} deleted={query.deleted === '1'} />;
  } else if (module.slug === 'future-self-visualization') {
    const query = await searchParams;
    const id = z.uuid().safeParse(query.entry);
    if (query.entry && !id.success) notFound();
    const page = typeof query.historyPage === 'string' && /^[1-9][0-9]{0,5}$/.test(query.historyPage) ? Number(query.historyPage) : 1;
    const [data, milestone] = await Promise.all([futureModule(client, owner, page, id.data ?? ''),
      !id.success ? connectedExercise(client, owner, query.milestone, 'life-timeline', 'timeline-v1') : null]);
    const proposed = z.iso.date().safeParse(milestone?.timing?.date);
    const milestoneDate = milestone?.future && !milestone.hidden && milestone.timing?.mode === 'exact'
      && proposed.success && proposed.data >= today ? proposed.data : undefined;
    if (id.success && !data.selected) notFound();
    content = <FutureSelf key={(data.selected?.revision ?? 'new') + ':' + page} {...data}
      page={page} today={today} timezone={timezone} preview={demo} milestoneDate={milestoneDate} saved={query.saved === '1' && Boolean(data.selected)} />;
  } else if (module.slug === 'body-awareness-map') {
    const query = await searchParams;
    const id = z.uuid().safeParse(query.observation);
    if (query.observation && !id.success) notFound();
    const page = typeof query.historyPage === 'string' && /^[1-9][0-9]{0,5}$/.test(query.historyPage) ? Number(query.historyPage) : 1;
    const [data, offeredEmotions] = await Promise.all([bodyModule(client, owner, page, id.data ?? ''),
      connectedMoodEmotions(client, owner, query.moodEntry)]);
    if (id.success && !data.selected) notFound();
    content = <BodyAwareness key={data.selected?.id ?? page} {...data} page={page} timezone={timezone} preview={demo} offeredEmotions={offeredEmotions}
      saved={query.saved === '1' && Boolean(data.selected)} />;
  } else if (module.slug === 'social-integration') {
    const query = await searchParams;
    const section = socialSection(query.section);
    const paginated = ['awareness', 'community', 'goals', 'journal', 'weekly'].includes(section);
    const page = paginated && typeof query.historyPage === 'string' && /^[1-9][0-9]{0,5}$/.test(query.historyPage)
      ? Number(query.historyPage) : 1;
    const [data, relationship] = await Promise.all([socialModule(client, owner, section, page, monday),
      section === 'journal' ? connectedExercise(client, owner, query.relationship, 'relationship-inventory', 'relationship-v1') : null]);
    content = <SocialIntegration key={section + page} {...data} relationshipLabel={typeof relationship?.label === 'string' ? relationship.label : undefined}
      today={today} monday={monday} timezone={timezone} page={page} section={section} preview={demo} />;
  } else if (module.slug === 'relationship-inventory') {
    const query = await searchParams;
    const selected = z.uuid().safeParse(query.relationshipId);
    if (query.relationshipId && !selected.success) notFound();
    const data = await relationshipModule(client, owner, selected.data ?? '');
    if (selected.success && !data.record) notFound();
    content = <RelationshipInventory key={data.record?.revision ?? 'new'} {...data} timezone={timezone} preview={demo} saved={query.saved} />;
  } else if (module.slug === 'boundary-builder') {
    const query = await searchParams;
    const selected = z.uuid().safeParse(query.boundaryId);
    if (query.boundaryId && !selected.success) notFound();
    const data = await boundaryModule(client, owner, selected.data ?? '');
    if (selected.success && !data.record.id) notFound();
    content = <BoundaryBuilder key={data.record.savedAt ? data.record.id : 'draft'} {...data} timezone={timezone} today={today} preview={demo}
      saved={query.saved === '1' && Boolean(data.record.savedAt)} />;
  } else if (module.slug === 'inner-critic-dialogue') {
    content = <InnerCriticDialogue {...await innerCriticModule(client, owner)} timezone={timezone} preview={demo} />;
  } else if (module.slug === 'cognitive-reframing') {
    content = <CognitiveReframing {...await reframingModule(client, owner)} timezone={timezone} preview={demo} />;
  } else if (module.slug === 'emotional-wheel') {
    content = <EmotionalWheel {...await emotionModule(client, owner)} today={today} timezone={timezone} preview={demo} />;
  } else if (module.slug === 'thought-record') {
    const requested = (await searchParams).historyPage;
    const page = typeof requested === 'string' && /^[1-9][0-9]{0,7}$/.test(requested) ? Number(requested) : 1;
    content = <ThoughtRecord {...await thoughtModule(client, owner, page)} timezone={timezone} preview={demo} />;
  } else if (module.slug === 'identity-mapping') {
    content = <IdentityMapping {...await identityModule(client, owner)} timezone={timezone} preview={demo} />;
  } else if (module.slug === 'values-assessment') {
    content = <ValuesAssessment {...await valuesModule(client, owner)} timezone={timezone} preview={demo} />;
  } else if (module.slug === 'wheel-of-life') {
    const [data, centralized] = await Promise.all([wheelModule(client, owner, timezone), centralRemindersActive(client, owner)]);
    content = <WheelOfLife {...data} timezone={timezone} preview={demo} centralized={centralized} />;
  } else if (module.slug === 'habit-tracker') {
    const query = await searchParams;
    const view = query.view === 'month' || query.view === 'calendar' ? query.view : 'week';
    const chosen = z.iso.date().safeParse(query.day);
    const day = chosen.success && chosen.data >= '1900-01-01' && chosen.data <= today ? chosen.data : today;
    const range = habitRange(day, view);
    const [data, options, centralized] = await Promise.all([
      growthHabits(client, owner, addDays(range.start, -28), range.end),
      habitOptions(client, owner),
      centralRemindersActive(client, owner),
    ]);
    const source = query.source === 'future' || query.source === 'social' ? query.source : '';
    content = <HabitTracker key={view + day + source} {...data} {...options} today={today} day={day} range={range}
      view={view} timezone={timezone} centralized={centralized} localTime={new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date())} source={source} preview={demo} />;
  } else if (module.slug === 'mood-tracker') {
    const query = await searchParams;
    const entry = z.uuid().safeParse(query.entry);
    if (query.entry && !entry.success) notFound();
    const requested = z.iso.date().safeParse(query.day);
    let day = requested.success && requested.data <= today && requested.data >= '1900-01-01' ? requested.data : today;
    const [initial, daily, emotionalEntry, centralized] = await Promise.all([
      advancedMoodModule(client, owner, day, entry.data ?? '', timezone),
      growthMoodHistory(client, owner, today),
      !entry.success ? connectedExercise(client, owner, query.emotionalEntry, 'emotional-wheel', 'emotion-v1') : null,
      centralRemindersActive(client, owner),
    ]);
    let data = initial;
    if (entry.success && !data.selected) notFound();
    if (data.selected && data.selected.day !== day) {
      day = data.selected.day;
      data = await advancedMoodModule(client, owner, day, data.selected.id, timezone);
    }
    const slot = moodSlots.find(item => item === query.slot) ?? null;
    content = <MoodTracker key={(query.day ?? '') + (data.selected?.revision ?? '') + (slot ?? '') + (query.edit ?? '')} {...data}
      today={today} day={day} timezone={timezone} timezones={growthTimezones} centralized={centralized} now={new Date().toISOString()} slot={slot} preview={demo}
      offeredEmotions={connectionEmotionLabels(emotionalEntry?.emotions)} editing={query.edit === '1'} saved={query.saved === '1'} deleted={query.deleted === '1'} scheduledToday={daily.map(row => row.slot)}
      legacyCard={<CheckIns entries={daily} today={today} preview={demo} dailyOnly />} />;
  } else {
    const [saved, history] = await Promise.all([
      growthExercise(client, owner, module.slug),
      growthExerciseHistory(client, owner, module.slug),
    ]);
    const formatDate = new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' });
    content = <><section className="panel growth-panel growth-exercise" aria-labelledby="exercise-prompts">
      <h2 id="exercise-prompts">Exercise prompts</h2>
      {saved && <p className="growth-status">{saved.completed_at ? 'Completed' : 'Draft saved'}</p>}
      <GrowthFields action={saveExercise.bind(null, module.slug)} fields={module.fields} answers={saved?.answers}
        revision={saved?.updated_at} useEmotions={emotionPickerModules.includes(module.slug)} initialEmotions={Array.isArray(saved?.answers?.emotions) ? saved.answers.emotions : undefined} exercise disabled={demo} />
    </section>
    {history.length > 0 && <section className="panel growth-panel growth-exercise" aria-labelledby="exercise-history">
      <h2 id="exercise-history">Previous completions</h2>
      {history.map(entry => <details key={entry.id}>
        <summary>{formatDate.format(new Date(entry.completed_at))}</summary>
        <dl className="growth-list">{module.fields.map((field, index) => <div key={field.label}>
          <dt><strong>{field.label}</strong></dt>
          <dd className="growth-note">{entry.answers[index] || 'No response saved'}</dd>
        </div>)}</dl>
      </details>)}
    </section>}</>;
  }
  return <Shell current="becoming" name={name} sample={demo}>
    <Link className="text-button growth-back" href="/becoming">Back to Personal Growth</Link>
    <Heading title={module.slug === 'social-integration' ? socialTitle : module.title} subtitle={module.description} />
    {demo && <GrowthPreview />}
    <div className="growth-module-content">
      <GrowthContentContext items={resources} module={demo ? undefined : module.slug}>
        {content}
      </GrowthContentContext>
      <GrowthContentLibrary items={resources} />
      {['identity-mapping', 'future-self-visualization'].includes(module.slug) && <section className="panel growth-panel" aria-labelledby="timeline-link">
        <h2 id="timeline-link">Life Timeline</h2>
        <Link className="text-button" href="/becoming/life-timeline">Open Life Timeline</Link>
      </section>}
      {['mood-tracker', 'emotional-wheel'].includes(module.slug) && <section className="panel growth-panel" aria-labelledby="body-awareness-link">
        <h2 id="body-awareness-link">Body awareness</h2>
        <p>Record a sensation separately if you’d like to reflect on what you noticed.</p>
        <Link className="text-button" href="/becoming/body-awareness-map">Open Body Awareness Map</Link>
      </section>}
    </div>
  </Shell>;
}
