create table public.growth_exercises (
  user_id uuid not null references auth.users on delete cascade,
  module_slug text not null check (module_slug in (
    'identity-mapping', 'values-assessment', 'life-timeline', 'thought-record',
    'emotional-wheel', 'cognitive-reframing', 'inner-critic-dialogue', 'relationship-inventory',
    'social-integration', 'boundary-builder', 'body-awareness-map', 'wheel-of-life', 'future-self-visualization'
  )),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 120000),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, module_slug)
);

create table public.growth_check_ins (
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null check (local_date <= (now() at time zone 'America/Los_Angeles')::date),
  slot text not null check (slot in ('daily', 'morning', 'midday', 'evening')),
  mood text not null check (mood in ('Joyful', 'Calm', 'Hopeful', 'Neutral', 'Sad', 'Anxious', 'Frustrated', 'Overwhelmed', 'Mixed')),
  note text not null default '' check (char_length(note) <= 2000),
  primary key (user_id, local_date, slot)
);

create table public.growth_weekly_reflections (
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null check (
    extract(isodow from week_start) = 1
    and week_start <= date_trunc('week', now() at time zone 'America/Los_Angeles')::date
  ),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 50000),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create table public.growth_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  started_on date not null default ((now() at time zone 'America/Los_Angeles')::date),
  archived_on date check (archived_on >= started_on),
  unique (id, user_id)
);

create index growth_habits_owner_idx on public.growth_habits (user_id, started_on, id);

create table public.growth_habit_logs (
  habit_id uuid not null,
  user_id uuid not null,
  local_date date not null check (local_date <= (now() at time zone 'America/Los_Angeles')::date),
  primary key (habit_id, local_date),
  foreign key (habit_id, user_id) references public.growth_habits (id, user_id) on delete cascade
);

create index growth_habit_logs_owner_date_idx on public.growth_habit_logs (user_id, local_date);

do $$
declare relation text;
begin
  foreach relation in array array[
    'growth_exercises', 'growth_check_ins', 'growth_weekly_reflections', 'growth_habits', 'growth_habit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from public, anon, authenticated', relation);
    execute format('grant select, insert, update, delete on public.%I to authenticated', relation);
    execute format(
      'create policy growth_owner on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      relation
    );
  end loop;
end;
$$;

create function public.check_growth_habit_log()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.growth_habits h where h.id = new.habit_id and h.user_id = new.user_id
      and new.local_date >= h.started_on and (h.archived_on is null or new.local_date <= h.archived_on)
  ) then
    raise exception 'Habit date is outside the tracking period' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_growth_habit_log() from public, anon, authenticated;
create trigger growth_habit_log_date before insert or update on public.growth_habit_logs
for each row execute function public.check_growth_habit_log();

create or replace function public.delete_personal_activity()
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
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
    'growthExercises', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by module_slug) from public.growth_exercises g where g.user_id = (select auth.uid())), '[]'::jsonb),
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
