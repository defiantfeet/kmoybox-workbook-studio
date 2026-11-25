create function public.valid_habit_schedule(schedule jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  mode text := schedule->>'mode';
  days jsonb := schedule->'days';
  day_count integer;
begin
  if jsonb_typeof(schedule) is distinct from 'object' or not (schedule ?& array['mode','days','every'])
    or schedule - array['mode','days','every'] <> '{}'::jsonb
    or jsonb_typeof(days) is distinct from 'array'
    or jsonb_typeof(schedule->'every') is distinct from 'number' or schedule->>'every' !~ '^[0-9]{1,3}$'
    or (schedule->>'every')::integer not between 1 and 365 then return false; end if;
  day_count := jsonb_array_length(days);
  if day_count > 7 or exists (select from jsonb_array_elements(days) d where d.value not in
    ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb,'6'::jsonb,'7'::jsonb)) then return false; end if;
  if day_count <> (select count(distinct value) from jsonb_array_elements(days)) then return false; end if;
  return coalesce(case mode when 'daily' then day_count = 0 when 'custom' then day_count = 0
    when 'weekly' then day_count = 1 when 'selected' then day_count > 0 end, false);
exception when data_exception then return false;
end;
$$;
revoke all on function public.valid_habit_schedule(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_habit_schedule(jsonb) to authenticated;

alter table public.growth_habits
  add column category text not null default '' check (category in ('','Personal growth','Emotional wellbeing','Physical movement',
    'Education','Creativity','Social connection','Community participation','Professional development','Rest and recovery','Daily routines')),
  add column motivation text not null default '' check (char_length(motivation) <= 2000),
  add column core_value text not null default '' check (char_length(core_value) <= 100),
  add column notes text not null default '' check (char_length(notes) <= 2000),
  add column ends_on date check (ends_on >= started_on),
  add column preferred_time text check (preferred_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column reminder boolean not null default false check (not reminder or preferred_time is not null),
  add column completion_type text not null default 'Check-off' check (completion_type in ('Check-off','Count','Minutes')),
  add column schedule jsonb not null default '{"mode":"daily","days":[],"every":1}' check (public.valid_habit_schedule(schedule)),
  add column schedule_history jsonb not null default '[]',
  add column paused boolean not null default false,
  add column goal_id uuid,
  add column source text not null default '' check (source in ('','future','social')),
  add foreign key (goal_id,user_id) references public.goals(id,user_id) on delete set null (goal_id);

create index growth_habits_goal_idx on public.growth_habits(goal_id,user_id) where goal_id is not null;

alter table public.growth_habit_logs
  add column state text not null default 'Completed' check (state in ('Completed','Partially completed','Rest day','Skipped')),
  add column amount numeric,
  add constraint growth_habit_log_amount_valid check (amount is null or (amount between 0 and 100000 and state in ('Completed','Partially completed')));

create or replace view public.habits with (security_invoker = true) as select * from public.growth_habits;
create or replace view public.habit_logs with (security_invoker = true) as select * from public.growth_habit_logs;

drop trigger growth_calendar on public.growth_habits;
create function public.record_growth_habit_schedule()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  today date := public.growth_local_day(new.user_id);
  effective_day date;
  history jsonb;
begin
  new.started_on := coalesce(new.started_on, today);
  new.updated_at := statement_timestamp();
  if tg_op = 'INSERT' then
    history := '[]'::jsonb;
    effective_day := new.started_on;
  else
    new.schedule_history := old.schedule_history;
    if (new.started_on,new.ends_on,new.paused,new.schedule) is not distinct from
       (old.started_on,old.ends_on,old.paused,old.schedule) then return new; end if;
    history := old.schedule_history;
    if history = '[]'::jsonb then
      history := jsonb_build_array(jsonb_build_object('day',old.started_on,'start',old.started_on,
        'end',old.ends_on,'paused',old.paused,'schedule',old.schedule));
    end if;
    effective_day := today;
    select coalesce(jsonb_agg(item order by item->>'day'),'[]'::jsonb) into history
      from jsonb_array_elements(history) item where (item->>'day')::date < effective_day;
  end if;
  new.schedule_history := history || jsonb_build_array(jsonb_build_object('day',effective_day,'start',new.started_on,
    'end',new.ends_on,'paused',new.paused,'schedule',new.schedule));
  return new;
end;
$$;
revoke all on function public.record_growth_habit_schedule() from public, anon, authenticated, service_role;
create trigger growth_habit_schedule before insert or update on public.growth_habits
for each row execute function public.record_growth_habit_schedule();

create or replace function public.check_growth_habit_log()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  habit public.growth_habits%rowtype;
  version jsonb;
  schedule jsonb;
  starts date;
  ends date;
  paused boolean;
begin
  select * into habit from public.growth_habits where id = new.habit_id and user_id = new.user_id;
  if not found then raise exception 'Habit date is outside the tracking period' using errcode = '23514'; end if;
  -- Allow corrections to records made before a schedule change on the same day.
  if exists (select from public.growth_habit_logs l where l.habit_id = new.habit_id
    and l.user_id = new.user_id and l.local_date = new.local_date) then return new; end if;
  select item into version from jsonb_array_elements(habit.schedule_history) item
    where (item->>'day')::date <= new.local_date order by item->>'day' desc limit 1;
  if version is null and habit.schedule_history <> '[]'::jsonb then
    raise exception 'Habit date is outside the tracking period' using errcode = '23514';
  end if;
  starts := coalesce((version->>'start')::date,habit.started_on);
  ends := case when version is null then habit.ends_on else (version->>'end')::date end;
  paused := coalesce((version->>'paused')::boolean,habit.paused);
  schedule := coalesce(version->'schedule',habit.schedule);
  if paused or new.local_date < starts or new.local_date > ends or new.local_date > habit.archived_on
    or (schedule->>'mode' in ('weekly','selected') and
      not (schedule->'days' @> jsonb_build_array(extract(isodow from new.local_date)::integer)))
    or (schedule->>'mode' = 'custom' and (new.local_date - starts) % (schedule->>'every')::integer <> 0) then
    raise exception 'Habit date is outside the tracking period' using errcode = '23514';
  end if;
  return new;
end;
$$;
