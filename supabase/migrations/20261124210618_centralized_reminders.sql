create function public.valid_central_reminders(config jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  kinds text[] := array['morning','midday','afternoon','evening','habits','goals','social','weekly','wheel','future','boundary','weeklyReport','monthlyReport'];
  item jsonb;
  clock_pattern text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if jsonb_typeof(config) is distinct from 'object' or not (config ?& array['enabled','quietStart','quietEnd','rules'])
    or config - array['enabled','quietStart','quietEnd','rules'] <> '{}'::jsonb
    or jsonb_typeof(config->'enabled') is distinct from 'boolean'
    or jsonb_typeof(config->'rules') is distinct from 'object'
    or not ((config->'rules') ?& kinds) or (config->'rules') - kinds <> '{}'::jsonb then return false; end if;
  if (config->>'quietStart' is null) <> (config->>'quietEnd' is null)
    or (config->>'quietStart' is not null and ((config->>'quietStart') !~ clock_pattern or
      (config->>'quietEnd') !~ clock_pattern or config->>'quietStart' = config->>'quietEnd')) then return false; end if;
  for item in select value from jsonb_each(config->'rules') loop
    if jsonb_typeof(item) is distinct from 'object' or not (item ?& array['enabled','frequency','time','weekday','monthDay','channel'])
      or item - array['enabled','frequency','time','weekday','monthDay','channel'] <> '{}'::jsonb
      or jsonb_typeof(item->'enabled') is distinct from 'boolean'
      or item->>'frequency' is null or item->>'frequency' not in ('due','daily','weekly','monthly')
      or item->>'channel' is null or item->>'channel' not in ('app','browser','both')
      or item->>'time' is null or (item->>'time') !~ clock_pattern
      or jsonb_typeof(item->'weekday') is distinct from 'number' or (item->>'weekday') !~ '^[1-7]$'
      or jsonb_typeof(item->'monthDay') is distinct from 'number' or (item->>'monthDay') !~ '^([1-9]|1[0-9]|2[0-8])$'
      then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.notification_preferences
  add column central_reminders jsonb check (central_reminders is null or public.valid_central_reminders(central_reminders)),
  add column reminders_paused_until timestamptz;

create table public.growth_reminder_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('morning','midday','afternoon','evening','habits','goals','social','weekly','wheel','future','boundary','weeklyReport','monthlyReport')),
  occurrence date not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  snoozed_until timestamptz,
  browser_claimed_at timestamptz,
  unique(user_id,kind,occurrence)
);
create index growth_reminder_events_owner_clock on public.growth_reminder_events(user_id,kind,created_at desc);
alter table public.growth_reminder_events enable row level security;
revoke all on public.growth_reminder_events from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.growth_reminder_events to authenticated;
create policy growth_reminder_events_owner on public.growth_reminder_events for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create function public.save_central_reminders(zone text, config jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode='42501'; end if;
  if not public.valid_central_reminders(config) or not exists(select from pg_timezone_names where name=zone) then
    raise exception 'Invalid reminder settings' using errcode='23514';
  end if;
  update public.profiles set growth_timezone=zone where id=owner_id;
  if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
  insert into public.notification_preferences(user_id,central_reminders) values(owner_id,config)
    on conflict (user_id) do update set central_reminders=excluded.central_reminders;
end;
$$;

create function public.refresh_central_reminders(candidates jsonb, browser_ready boolean, include_browser_inbox boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  moment timestamptz := statement_timestamp();
  config jsonb;
  paused_until timestamptz;
  local_clock time;
  local_day date;
  quiet_start time;
  quiet_end time;
  notices jsonb := '[]'::jsonb;
  browser jsonb := '[]'::jsonb;
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode='42501'; end if;
  if jsonb_typeof(candidates) is distinct from 'array' then return jsonb_build_object('notices',notices,'browser',browser); end if;
  if jsonb_array_length(candidates) > 13 then return jsonb_build_object('notices',notices,'browser',browser); end if;
  select central_reminders,reminders_paused_until into config,paused_until
    from public.notification_preferences where user_id=owner_id for update;
  select (moment at time zone growth_timezone)::time,(moment at time zone growth_timezone)::date
    into local_clock,local_day from public.profiles where id=owner_id;
  quiet_start := (config->>'quietStart')::time;
  quiet_end := (config->>'quietEnd')::time;
  if not coalesce((config->>'enabled')::boolean,false) or paused_until > moment or
    (quiet_start < quiet_end and local_clock >= quiet_start and local_clock < quiet_end) or
    (quiet_start > quiet_end and (local_clock >= quiet_start or local_clock < quiet_end)) then
    return jsonb_build_object('notices',notices,'browser',browser);
  end if;

  insert into public.growth_reminder_events(user_id,kind,occurrence)
    select owner_id, incoming.kind, incoming.occurrence
    from jsonb_to_recordset(candidates) as incoming(kind text,occurrence date)
    where (config->'rules'->incoming.kind->>'enabled')::boolean
      and local_clock >= (config->'rules'->incoming.kind->>'time')::time
      and incoming.occurrence between local_day - 65 and local_day
      and not exists (select from public.growth_reminder_events prior where prior.user_id=owner_id and prior.kind=incoming.kind
        and prior.created_at > moment - interval '12 hours')
    on conflict (user_id,kind,occurrence) do nothing;

  if browser_ready then
    with latest as (
      select distinct on (e.kind) e.id from public.growth_reminder_events e
      where e.user_id=owner_id and coalesce(e.snoozed_until,e.created_at) > moment - interval '36 hours'
      order by e.kind,e.created_at desc,e.id
    ), claimed as (
      update public.growth_reminder_events e set browser_claimed_at=moment
      from latest where e.id=latest.id and e.user_id=owner_id and e.browser_claimed_at is null and e.dismissed_at is null
        and (e.snoozed_until is null or e.snoozed_until <= moment)
        and (config->'rules'->e.kind->>'enabled')::boolean
        and config->'rules'->e.kind->>'channel' in ('browser','both')
      returning e.id,e.kind as type,e.occurrence
    ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into browser from claimed;
  end if;

  select coalesce(jsonb_agg(to_jsonb(active)),'[]'::jsonb) into notices from (
    select e.id,e.kind as type,e.occurrence,e.snoozed_until from (
      select distinct on (kind) id,kind,occurrence,snoozed_until,dismissed_at
      from public.growth_reminder_events where user_id=owner_id
        and coalesce(snoozed_until,created_at) > moment - interval '36 hours'
      order by kind,created_at desc,id
    ) e where e.dismissed_at is null
      and (e.snoozed_until is null or e.snoozed_until <= moment or include_browser_inbox)
      and (config->'rules'->e.kind->>'enabled')::boolean
      and (include_browser_inbox or config->'rules'->e.kind->>'channel' in ('app','both'))
  ) active;
  return jsonb_build_object('notices',notices,'browser',browser);
end;
$$;

revoke all on function public.valid_central_reminders(jsonb), public.save_central_reminders(text,jsonb),
  public.refresh_central_reminders(jsonb,boolean,boolean) from public, anon, authenticated, service_role;
grant execute on function public.valid_central_reminders(jsonb), public.save_central_reminders(text,jsonb),
  public.refresh_central_reminders(jsonb,boolean,boolean) to authenticated;

create or replace function public.delete_personal_activity()
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  delete from public.growth_reminder_events where user_id = owner_id;
  delete from public.growth_reports where user_id = owner_id;
  delete from public.social_interactions where user_id = owner_id;
  delete from public.social_goals where user_id = owner_id;
  delete from public.notification_preferences where user_id = owner_id;
  update public.profiles set growth_timezone = default where id = owner_id;
  delete from public.supportive_statements where user_id = owner_id;
  delete from public.growth_exercises where user_id = owner_id;
  delete from public.growth_check_ins where user_id = owner_id;
  delete from public.growth_weekly_reflections where user_id = owner_id;
  delete from public.growth_habits where user_id = owner_id;
  delete from public.journal_entries where user_id = owner_id;
  delete from public.goals where user_id = owner_id;
  delete from public.responses where user_id = owner_id;
  delete from public.engine_progress where user_id = owner_id;
end;
$$;
create or replace function public.export_personal_activity()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'growthProfile', (select jsonb_build_object('timezone', growth_timezone) from public.profiles where id = (select auth.uid())),
    'socialGoals', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by created_at, id) from public.social_goals g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'socialInteractions', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by occurred_at, id) from public.social_interactions g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'notificationPreferences', (select to_jsonb(g) - 'user_id' from public.notification_preferences g where g.user_id = (select auth.uid())),
    'valuesPractices', coalesce((select jsonb_agg(to_jsonb(v) - 'user_id' order by created_at, id) from public.values_practices v where v.user_id = (select auth.uid())), '[]'::jsonb),
    'supportiveStatements', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by created_at, id) from public.supportive_statements s where s.user_id = (select auth.uid())), '[]'::jsonb),
    'boundaryPracticeEntries', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id' order by occurred_on, created_at, id) from public.boundary_practice_entries b where b.user_id = (select auth.uid())), '[]'::jsonb),
    'timelineImages', coalesce((select jsonb_agg(jsonb_build_object('eventId', i.event_id, 'mimeType', i.mime_type,
      'base64', replace(encode(i.content,'base64'),chr(10),'')) order by i.event_id)
      from public.timeline_images i where i.user_id = (select auth.uid())), '[]'::jsonb),
    'reminderEvents', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by occurrence,kind)
      from public.growth_reminder_events e where e.user_id=(select auth.uid())), '[]'::jsonb),
    'growthReports', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by period_start, kind)
      from public.growth_reports r where r.user_id = (select auth.uid())), '[]'::jsonb),
    'growthExercises', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by module_slug, updated_at, id) from public.growth_exercises g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'growthCheckIns', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by local_date, slot) from public.growth_check_ins g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'growthWeeklyReflections', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by week_start) from public.growth_weekly_reflections g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'growthHabits', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by started_on, id) from public.growth_habits g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'growthHabitLogs', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by local_date, habit_id) from public.growth_habit_logs g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'journalEntries', coalesce((select jsonb_agg(to_jsonb(j) - 'user_id' order by created_at) from public.journal_entries j where j.user_id = (select auth.uid())), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by created_at) from public.goals g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'milestones', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by created_at) from public.goal_milestones m where m.user_id = (select auth.uid())), '[]'::jsonb),
    'goalHistory', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id' order by created_at) from public.goal_activity h where h.user_id = (select auth.uid())), '[]'::jsonb),
    'workbookResponses', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by prompt_id) from public.responses r where r.user_id = (select auth.uid())), '[]'::jsonb),
    'moduleResponses', coalesce((select jsonb_agg(to_jsonb(p) - 'user_id' order by updated_at) from public.engine_progress p where p.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;
