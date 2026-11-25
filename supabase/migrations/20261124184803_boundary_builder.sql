create function public.valid_boundary(payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or payload->>'format' is distinct from 'boundary-v1'
    or coalesce(payload->>'category', 'missing') not in ('','Physical','Emotional','Time','Financial','Digital',
      'Professional','Family','Romantic','Social','Personal privacy')
    or coalesce(payload->>'zone', 'missing') not in ('','Comfortable','Conditional or negotiable','Not acceptable')
    or coalesce(payload->>'safety', 'missing') not in ('','safe','uncertain','unsafe')
    or jsonb_typeof(payload->'notes') is distinct from 'object'
    or jsonb_typeof(payload->'script') is distinct from 'string' or char_length(payload->>'script') > 2000
    or jsonb_typeof(payload->'followUpDate') is distinct from 'string'
    or payload->>'followUpDate' !~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})?$'
    or jsonb_typeof(payload->'relationshipId') is distinct from 'string'
    or payload->>'relationshipId' !~ '^([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})?$'
    or payload - array['format','category','zone','safety','notes','script','followUpDate','relationshipId'] <> '{}'::jsonb
  then return false; end if;
  if payload->>'followUpDate' <> '' then
    begin
      perform (payload->>'followUpDate')::date;
    exception when datetime_field_overflow or invalid_datetime_format then return false;
    end;
  end if;
  return not exists (
    select from jsonb_each(payload->'notes') as field(key,value)
    where key not in ('situation','need','value','current','desired','preference','action','obstacles','followUp')
      or jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 2000
  );
end;
$$;
revoke all on function public.valid_boundary(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_boundary(jsonb) to authenticated;

create index growth_boundary_followup_idx on public.growth_exercises (user_id, (answers->>'followUpDate'))
  where module_slug = 'boundary-builder' and completed_at is not null and answers->>'followUpDate' > '';

create table public.boundary_practice_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  boundary_id uuid not null,
  occurred_on date not null,
  practice text not null default '' check (char_length(practice) <= 2000),
  reflection text not null default '' check (char_length(reflection) <= 2000),
  created_at timestamptz not null default now(),
  check (btrim(practice) <> '' or btrim(reflection) <> ''),
  foreign key (boundary_id, user_id) references public.growth_exercises (id, user_id) on delete cascade
);
create index boundary_practice_owner_idx on public.boundary_practice_entries (user_id, boundary_id, occurred_on desc, created_at desc);
alter table public.boundary_practice_entries enable row level security;
revoke all on public.boundary_practice_entries from public, anon, authenticated, service_role;
grant select, insert, delete on public.boundary_practice_entries to authenticated;
create policy boundary_practice_read on public.boundary_practice_entries for select to authenticated using (user_id = (select auth.uid()));
create policy boundary_practice_delete on public.boundary_practice_entries for delete to authenticated using (user_id = (select auth.uid()));
create policy boundary_practice_insert on public.boundary_practice_entries for insert to authenticated with check (
  user_id = (select auth.uid()) and occurred_on <= public.growth_local_day(user_id)
  and exists (select 1 from public.growth_exercises b where b.id = boundary_id and b.user_id = (select auth.uid())
    and b.module_slug = 'boundary-builder' and b.completed_at is not null)
);

create or replace function public.preserve_completed_growth_exercise()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id, new.user_id, new.module_slug) is distinct from
     (old.id, old.user_id, old.module_slug)
    or (new.is_current is distinct from old.is_current and not (
      old.is_current and not new.is_current and new.completed_at is not null and (
        (old.module_slug = 'wheel-of-life' and new.answers ? 'domains')
        or (old.module_slug = 'values-assessment' and new.answers->>'format' = 'values-v1')
        or (old.module_slug = 'identity-mapping' and new.answers->>'format' = 'identity-v1')
        or (old.module_slug = 'thought-record' and new.answers->>'format' = 'thought-v1')
        or (old.module_slug = 'emotional-wheel' and new.answers->>'format' = 'emotion-v1')
        or (old.module_slug = 'cognitive-reframing' and new.answers->>'format' = 'reframe-v1')
        or (old.module_slug = 'inner-critic-dialogue' and new.answers->>'format' = 'dialogue-v1')
        or (old.module_slug = 'boundary-builder' and new.answers->>'format' = 'boundary-v1')
      )
    )) then
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
create or replace function public.validate_growth_exercise_answers()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  payload jsonb := new.answers;
  field_count integer := case new.module_slug
    when 'wheel-of-life' then 9
    when 'thought-record' then 4
    else 3
  end;
begin
  -- Preserve a legacy completion verbatim when the archive trigger copies it.
  if tg_op = 'INSERT' and not new.is_current and pg_trigger_depth() > 1 then return new; end if;
  if new.module_slug = 'boundary-builder' and new.answers->>'format' = 'boundary-v1' then
    if not public.valid_boundary(new.answers) or (not new.is_current and new.completed_at is null)
      or (new.completed_at is not null and new.answers->>'zone' = '') then
      raise exception 'Invalid boundary entry' using errcode = '23514';
    end if;
    if new.answers->>'relationshipId' <> '' and (
      tg_op = 'INSERT' or new.answers->>'relationshipId' is distinct from old.answers->>'relationshipId'
    ) and not exists (
      select 1 from public.growth_exercises inventory where inventory.id = (new.answers->>'relationshipId')::uuid
        and inventory.user_id = new.user_id and inventory.module_slug = 'relationship-inventory'
    ) then raise exception 'Relationship entry unavailable' using errcode = '23514'; end if;
    return new;
  end if;
  if new.module_slug = 'inner-critic-dialogue' and new.answers->>'format' = 'dialogue-v1' then
    if not public.valid_inner_critic_dialogue(new.answers) or (not new.is_current and new.completed_at is null) then
      raise exception 'Invalid dialogue entry' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug = 'cognitive-reframing' and new.answers->>'format' = 'reframe-v1' then
    if not public.valid_reframe_entry(new.answers)
      or (not new.is_current and new.completed_at is null)
      or (new.completed_at is not null and new.answers->>'stage' <> '5') then
      raise exception 'Invalid reframing entry' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug = 'emotional-wheel' and new.answers->>'format' = 'emotion-v1' then
    if new.is_current or new.completed_at is null or not public.valid_emotion_entry(new.answers) then
      raise exception 'Invalid emotion entry' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug = 'thought-record' and new.answers->>'format' = 'thought-v1' then
    if not public.valid_thought_record(new.answers)
      or (not new.is_current and new.completed_at is null) then
      raise exception 'Invalid thought record' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug = 'identity-mapping' and new.answers->>'format' = 'identity-v1' then
    if not public.valid_identity_map(new.answers) or (not new.is_current and new.completed_at is null) then
      raise exception 'Invalid identity map' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug = 'values-assessment' and new.answers->>'format' = 'values-v1' then
    if not public.valid_values_assessment(new.answers, new.completed_at is not null)
      or (not new.is_current and new.completed_at is null) then
      raise exception 'Invalid values assessment' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug = 'wheel-of-life' and new.answers ? 'domains' then
    if jsonb_typeof(new.answers->'domains') is distinct from 'array' then
      raise exception 'Invalid Wheel of Life domains' using errcode = '23514';
    end if;
    if jsonb_array_length(new.answers->'domains') not between 1 and 12
      or new.answers - 'domains' - 'reflection' <> '{}'::jsonb
      or (new.answers ? 'reflection' and (
        jsonb_typeof(new.answers->'reflection') is distinct from 'string'
        or char_length(new.answers->>'reflection') > 2000
      ))
      or exists (
        select 1 from jsonb_array_elements(new.answers->'domains') as item(domain)
        where jsonb_typeof(domain) is distinct from 'object'
          or domain->>'id' is null or (domain->>'id') !~ '^[a-z0-9-]{1,48}$'
          or jsonb_typeof(domain->'id') is distinct from 'string'
          or jsonb_typeof(domain->'label') is distinct from 'string'
          or char_length(btrim(domain->>'label')) not between 1 and 80
          or jsonb_typeof(domain->'note') is distinct from 'string' or char_length(domain->>'note') > 2000
          or jsonb_typeof(domain->'priority') is distinct from 'boolean'
          or not coalesce(
            domain->'rating' = 'null'::jsonb and new.completed_at is null
            or jsonb_typeof(domain->'rating') = 'number' and (domain->>'rating') ~ '^[1-9]$|^10$', false
          )
      )
      or exists (
        select 1 from jsonb_array_elements(new.answers->'domains') as item(domain)
        group by domain->>'id' having count(*) > 1
      )
      or exists (
        select 1 from jsonb_array_elements(new.answers->'domains') as item(domain)
        group by lower(btrim(domain->>'label')) having count(*) > 1
      )
      or (not new.is_current and new.completed_at is null)
    then
      raise exception 'Invalid Wheel of Life domains' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug in ('cognitive-reframing','body-awareness-map','relationship-inventory','inner-critic-dialogue')
    and payload ? 'emotions' then
    if not public.valid_emotion_labels(payload->'emotions') then
      raise exception 'Invalid emotion labels' using errcode = '23514';
    end if;
    payload := payload - 'emotions';
  end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid exercise responses' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_each(payload) as answer(key, value)
    where key not in (select index::text from generate_series(0, field_count - 1) as field(index))
       or jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 2000
       or (new.completed_at is not null and btrim(value #>> '{}') = '')
       or (new.module_slug = 'wheel-of-life' and key <> '8'
           and (value #>> '{}') !~ '^([1-9]|10)?$')
  ) or (new.completed_at is not null and (
    select count(*) from jsonb_object_keys(payload)
  ) <> field_count) then
    raise exception 'Invalid exercise responses' using errcode = '23514';
  end if;
  return new;
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
