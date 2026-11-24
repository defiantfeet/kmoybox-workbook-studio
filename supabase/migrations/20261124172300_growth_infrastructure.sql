-- Preserve the existing Studio identity, goals, and saved growth activity.
alter table public.profiles add column growth_timezone text not null default 'America/Los_Angeles';
grant update (growth_timezone) on public.profiles to authenticated;

create function public.validate_growth_timezone()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names
    where name = new.growth_timezone and (name = 'UTC' or name like '%/%')
      and name not like 'posix/%' and name not like 'right/%'
  ) then
    raise exception 'Choose a named timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger validate_growth_timezone before insert or update of growth_timezone on public.profiles
for each row execute function public.validate_growth_timezone();

create function public.growth_local_day(owner_id uuid)
returns date language sql stable security invoker set search_path = '' as $$
  select (statement_timestamp() at time zone coalesce(
    (select growth_timezone from public.profiles where id = owner_id), 'America/Los_Angeles'
  ))::date;
$$;

alter table public.growth_exercises
  drop constraint growth_exercises_pkey,
  add column id uuid primary key default gen_random_uuid(),
  add column created_at timestamptz,
  add column is_current boolean not null default true;
update public.growth_exercises set created_at = updated_at;
alter table public.growth_exercises alter column created_at set not null, alter column created_at set default now();
create unique index growth_current_exercise_idx on public.growth_exercises (user_id, module_slug) where is_current;
create index growth_exercise_history_idx on public.growth_exercises (user_id, module_slug, completed_at desc, id)
  where completed_at is not null;
create index growth_exercise_activity_idx on public.growth_exercises (user_id, updated_at desc, id);

create function public.preserve_completed_growth_exercise()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id, new.user_id, new.module_slug, new.is_current) is distinct from
     (old.id, old.user_id, old.module_slug, old.is_current) then
    raise exception 'Exercise identity cannot change' using errcode = '23514';
  end if;
  if old.is_current and old.completed_at is not null
    and (old.answers, old.completed_at) is distinct from (new.answers, new.completed_at) then
    insert into public.growth_exercises
      (user_id, module_slug, answers, created_at, updated_at, completed_at, is_current)
    values (old.user_id, old.module_slug, old.answers, old.created_at, old.updated_at, old.completed_at, false);
    new.created_at := statement_timestamp();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
create trigger preserve_completed_growth_exercise before update on public.growth_exercises
for each row execute function public.preserve_completed_growth_exercise();

create function public.validate_growth_exercise_answers()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  field_count integer := case new.module_slug
    when 'wheel-of-life' then 9
    when 'thought-record' then 4
    else 3
  end;
begin
  -- Preserve a legacy completion verbatim when the archive trigger copies it.
  if tg_op = 'INSERT' and not new.is_current and pg_trigger_depth() > 1 then return new; end if;
  if jsonb_typeof(new.answers) <> 'object' then
    raise exception 'Invalid exercise responses' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_each(new.answers) as answer(key, value)
    where key not in (select index::text from generate_series(0, field_count - 1) as field(index))
       or jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 2000
       or (new.completed_at is not null and btrim(value #>> '{}') = '')
       or (new.module_slug = 'wheel-of-life' and key <> '8'
           and (value #>> '{}') !~ '^([1-9]|10)?$')
  ) or (new.completed_at is not null and (
    select count(*) from jsonb_object_keys(new.answers)
  ) <> field_count) then
    raise exception 'Invalid exercise responses' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_growth_exercise_answers before insert or update of answers, completed_at
on public.growth_exercises for each row execute function public.validate_growth_exercise_answers();

alter table public.growth_check_ins
  drop constraint growth_check_ins_pkey,
  drop constraint growth_check_ins_local_date_check,
  add column id uuid primary key default gen_random_uuid(),
  add column timezone text not null default 'America/Los_Angeles',
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add unique (user_id, local_date, slot);

alter table public.growth_weekly_reflections
  drop constraint growth_weekly_reflections_pkey,
  drop constraint growth_weekly_reflections_week_start_check,
  add column id uuid primary key default gen_random_uuid(),
  add column created_at timestamptz,
  add check (extract(isodow from week_start) = 1),
  add unique (user_id, week_start);
update public.growth_weekly_reflections set created_at = updated_at;
alter table public.growth_weekly_reflections alter column created_at set not null, alter column created_at set default now();

alter table public.growth_habits
  alter column started_on drop default,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

alter table public.growth_habit_logs
  drop constraint growth_habit_logs_pkey,
  drop constraint growth_habit_logs_local_date_check,
  add column id uuid primary key default gen_random_uuid(),
  add column created_at timestamptz not null default now(),
  add unique (habit_id, local_date);

create function public.validate_growth_calendar()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  today date := public.growth_local_day(new.user_id);
begin
  if tg_table_name = 'growth_habits' then
    new.started_on := coalesce(new.started_on, today);
    if (tg_op = 'INSERT' or new.started_on is distinct from old.started_on) and new.started_on > today then
      raise exception 'Habit cannot start in the future' using errcode = '23514';
    end if;
    new.updated_at := statement_timestamp();
  elsif tg_table_name = 'growth_weekly_reflections' then
    if (tg_op = 'INSERT' or new.week_start is distinct from old.week_start) and new.week_start > today then
      raise exception 'Week cannot start in the future' using errcode = '23514';
    end if;
  elsif tg_table_name = 'growth_check_ins' then
    if tg_op = 'INSERT' or new.local_date is distinct from old.local_date then
      new.timezone := coalesce((select growth_timezone from public.profiles where id = new.user_id), 'America/Los_Angeles');
      new.local_date := coalesce(new.local_date, today);
      if new.local_date > today then
        raise exception 'Check-in date cannot be in the future' using errcode = '23514';
      end if;
    else
      new.timezone := old.timezone;
    end if;
    new.updated_at := statement_timestamp();
  elsif (tg_op = 'INSERT' or new.local_date is distinct from old.local_date) and new.local_date > today then
    raise exception 'Habit log date cannot be in the future' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger growth_calendar before insert or update on public.growth_check_ins
for each row execute function public.validate_growth_calendar();
create trigger growth_calendar before insert or update on public.growth_weekly_reflections
for each row execute function public.validate_growth_calendar();
create trigger growth_calendar before insert or update on public.growth_habits
for each row execute function public.validate_growth_calendar();
create trigger growth_calendar before insert or update on public.growth_habit_logs
for each row execute function public.validate_growth_calendar();

create table public.social_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null,
  unique (user_id, goal_id),
  unique (id, user_id),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);

create table public.social_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  social_goal_id uuid,
  occurred_at timestamptz not null default now(),
  reflection text not null default '' check (char_length(reflection) <= 4000),
  created_at timestamptz not null default now(),
  foreign key (social_goal_id, user_id) references public.social_goals (id, user_id)
    on delete set null (social_goal_id)
);
create index social_interactions_owner_time_idx on public.social_interactions (user_id, occurred_at desc, id);
create index social_interactions_goal_idx on public.social_interactions (social_goal_id, user_id);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users on delete cascade,
  daily_check_in_enabled boolean not null default false,
  daily_check_in_time time,
  weekly_reflection_enabled boolean not null default false,
  weekly_reflection_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not daily_check_in_enabled or daily_check_in_time is not null),
  check (not weekly_reflection_enabled or weekly_reflection_time is not null)
);

create function public.touch_growth_timestamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;
create trigger notification_preferences_timestamp before update on public.notification_preferences
for each row execute function public.touch_growth_timestamp();

do $$
declare
  relation text;
  module record;
begin
  foreach relation in array array['social_goals', 'social_interactions', 'notification_preferences'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', relation);
    execute format('grant select, insert, update, delete on public.%I to authenticated', relation);
    execute format(
      'create policy growth_owner on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      relation
    );
  end loop;

  for module in select * from (values
    ('wheel_of_life_entries', 'wheel-of-life'), ('values_assessments', 'values-assessment'),
    ('thought_records', 'thought-record'), ('emotion_entries', 'emotional-wheel'), ('boundary_entries', 'boundary-builder'),
    ('identity_maps', 'identity-mapping'), ('cognitive_reframes', 'cognitive-reframing'),
    ('relationship_entries', 'relationship-inventory'), ('body_awareness_entries', 'body-awareness-map'),
    ('future_self_entries', 'future-self-visualization'), ('inner_critic_entries', 'inner-critic-dialogue'),
    ('life_timeline_events', 'life-timeline')
  ) as modules(view_name, slug) loop
    execute format(
      'create view public.%I with (security_invoker = true) as select * from public.growth_exercises where module_slug = %L with local check option',
      module.view_name, module.slug
    );
    execute format('alter view public.%I alter column module_slug set default %L', module.view_name, module.slug);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', module.view_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', module.view_name);
  end loop;
end;
$$;

create view public.growth_profiles with (security_invoker = true) as
select id, display_name, growth_timezone from public.profiles;
create view public.growth_goals with (security_invoker = true) as select * from public.goals;
create view public.habits with (security_invoker = true) as select * from public.growth_habits;
create view public.habit_logs with (security_invoker = true) as select * from public.growth_habit_logs;
create view public.mood_checkins with (security_invoker = true) as select * from public.growth_check_ins;
create view public.weekly_reflections with (security_invoker = true) as select * from public.growth_weekly_reflections;

revoke all on public.growth_profiles, public.growth_goals, public.habits, public.habit_logs, public.mood_checkins, public.weekly_reflections
from public, anon, authenticated, service_role;
grant select, update (growth_timezone) on public.growth_profiles to authenticated;
grant select, insert, update, delete on public.growth_goals, public.habits, public.habit_logs, public.mood_checkins, public.weekly_reflections to authenticated;

revoke all on function public.validate_growth_timezone(), public.preserve_completed_growth_exercise(),
  public.validate_growth_calendar(), public.touch_growth_timestamp(), public.validate_growth_exercise_answers() from public, anon, authenticated, service_role;
revoke all on function public.growth_local_day(uuid) from public, anon, authenticated, service_role;
grant execute on function public.growth_local_day(uuid) to authenticated;

alter table public.growth_exercises alter column user_id set default auth.uid();
alter table public.growth_check_ins alter column user_id set default auth.uid();
alter table public.growth_habits alter column user_id set default auth.uid();
alter table public.growth_habit_logs alter column user_id set default auth.uid();
alter table public.growth_weekly_reflections alter column user_id set default auth.uid();
revoke all on public.growth_exercises, public.growth_check_ins, public.growth_habits,
  public.growth_habit_logs, public.growth_weekly_reflections from service_role;

create or replace function public.delete_personal_activity()
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  delete from public.social_interactions where user_id = owner_id;
  delete from public.social_goals where user_id = owner_id;
  delete from public.notification_preferences where user_id = owner_id;
  update public.profiles set growth_timezone = default where id = owner_id;
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
