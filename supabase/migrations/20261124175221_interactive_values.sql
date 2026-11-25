create function public.valid_values_assessment(payload jsonb, finished boolean)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  known text[] := array['kindness', 'belonging', 'loyalty', 'empathy', 'forgiveness', 'generosity', 'mutuality', 'friendship', 'honesty', 'integrity', 'courage', 'humility', 'accountability', 'patience', 'reliability', 'discernment', 'curiosity', 'creativity', 'craft', 'inquiry', 'learning', 'adaptability', 'imagination', 'resourcefulness', 'autonomy', 'purpose', 'initiative', 'self-respect', 'authenticity', 'flexibility', 'intentionality', 'adventure', 'justice', 'dignity', 'accessibility', 'solidarity', 'service', 'stewardship', 'participation', 'fairness', 'rest', 'presence', 'play', 'health', 'simplicity', 'stability', 'beauty', 'financial-care', 'gratitude', 'wonder', 'hope', 'tradition', 'spirituality', 'remembrance', 'legacy', 'nature', 'focus', 'persistence', 'collaboration', 'excellence', 'experimentation', 'practicality', 'contribution', 'independence'];
  selected text[];
  shortlist text[];
  ranked text[];
  custom_value jsonb;
  response jsonb;
  value_key text;
  labels text[] := array['kindness', 'belonging', 'loyalty', 'empathy', 'forgiveness', 'generosity', 'mutuality', 'friendship', 'honesty', 'integrity', 'courage', 'humility', 'accountability', 'patience', 'reliability', 'discernment', 'curiosity', 'creativity', 'craft', 'inquiry', 'learning', 'adaptability', 'imagination', 'resourcefulness', 'autonomy', 'purpose', 'initiative', 'self-respect', 'authenticity', 'flexibility', 'intentionality', 'adventure', 'justice', 'dignity', 'accessibility', 'solidarity', 'service', 'stewardship', 'participation', 'fairness', 'rest', 'presence', 'play', 'health', 'simplicity', 'stability', 'beauty', 'financial care', 'gratitude', 'wonder', 'hope', 'tradition', 'spirituality', 'remembrance', 'legacy', 'connection to nature', 'focus', 'persistence', 'collaboration', 'excellence', 'experimentation', 'practicality', 'contribution', 'independence'];
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or payload->>'format' is distinct from 'values-v1'
    or jsonb_typeof(payload->'stage') is distinct from 'number'
    or not coalesce(payload->>'stage' ~ '^[1-6]$', false)
    or jsonb_typeof(payload->'custom') is distinct from 'array'
    or jsonb_typeof(payload->'selected') is distinct from 'array'
    or jsonb_typeof(payload->'shortlist') is distinct from 'array'
    or jsonb_typeof(payload->'ranked') is distinct from 'array'
    or jsonb_typeof(payload->'responses') is distinct from 'object'
    or jsonb_typeof(payload->'statement') is distinct from 'string'
    or char_length(payload->>'statement') > 10000
    or payload - array['format','stage','custom','selected','shortlist','ranked','responses','statement','earlier'] <> '{}'::jsonb
  then return false; end if;
  if payload ? 'earlier' then
    if jsonb_typeof(payload->'earlier') is distinct from 'array' then return false; end if;
    if jsonb_array_length(payload->'earlier') > 3 or exists (
      select from jsonb_array_elements(payload->'earlier') item
      where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 2000
    ) then return false; end if;
  end if;
  if jsonb_array_length(payload->'custom') > 15 or (select count(*) from jsonb_object_keys(payload->'responses')) > 15 then return false; end if;
  for custom_value in select * from jsonb_array_elements(payload->'custom') loop
    if jsonb_typeof(custom_value) is distinct from 'object'
      or jsonb_typeof(custom_value->'id') is distinct from 'string'
      or not coalesce(custom_value->>'id' ~ '^custom-[a-z0-9-]{1,41}$', false)
      or (custom_value->>'id') = any(known)
      or jsonb_typeof(custom_value->'label') is distinct from 'string'
      or char_length(btrim(custom_value->>'label')) not between 1 and 80
      or lower(btrim(custom_value->>'label')) = any(labels)
      or jsonb_typeof(custom_value->'definition') is distinct from 'string'
      or char_length(btrim(custom_value->>'definition')) not between 1 and 240
      or custom_value - array['id','label','definition'] <> '{}'::jsonb
    then return false; end if;
    known := array_append(known, custom_value->>'id');
    labels := array_append(labels, lower(btrim(custom_value->>'label')));
  end loop;
  select array(select jsonb_array_elements_text(payload->'selected')),
         array(select jsonb_array_elements_text(payload->'shortlist')),
         array(select jsonb_array_elements_text(payload->'ranked'))
    into selected, shortlist, ranked;
  if cardinality(selected) > 15 or cardinality(shortlist) > 10 or cardinality(ranked) > 5
    or not selected <@ known or not shortlist <@ selected or not ranked <@ shortlist
    or cardinality(selected) <> (select count(distinct item) from unnest(selected) item)
    or cardinality(shortlist) <> (select count(distinct item) from unnest(shortlist) item)
    or cardinality(ranked) <> (select count(distinct item) from unnest(ranked) item)
  then return false; end if;
  for value_key, response in select * from jsonb_each(payload->'responses') loop
    if not value_key = any(known) or jsonb_typeof(response) <> 'object' then return false; end if;
    if exists (
      select from jsonb_each(response) as field(key, value)
      where key not in ('matter','influence','actions','conflict','respect','week')
        or jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 1500
    ) then return false; end if;
  end loop;
  return not finished or (payload->>'stage' = '6' and cardinality(shortlist) = 10
    and cardinality(ranked) = 5 and length(btrim(payload->>'statement')) > 0);
end;
$$;

revoke all on function public.valid_values_assessment(jsonb, boolean) from public, anon, authenticated, service_role;
grant execute on function public.valid_values_assessment(jsonb, boolean) to authenticated;

create or replace function public.preserve_completed_growth_exercise()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id, new.user_id, new.module_slug) is distinct from
     (old.id, old.user_id, old.module_slug)
    or (new.is_current is distinct from old.is_current and not (
      old.is_current and not new.is_current and new.completed_at is not null and (
        (old.module_slug = 'wheel-of-life' and new.answers ? 'domains')
        or (old.module_slug = 'values-assessment' and new.answers->>'format' = 'values-v1')
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
  field_count integer := case new.module_slug
    when 'wheel-of-life' then 9
    when 'thought-record' then 4
    else 3
  end;
begin
  -- Preserve a legacy completion verbatim when the archive trigger copies it.
  if tg_op = 'INSERT' and not new.is_current and pg_trigger_depth() > 1 then return new; end if;
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

alter table public.growth_exercises add constraint growth_exercises_id_owner unique (id, user_id);

create table public.values_practices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  assessment_id uuid not null,
  value_key text not null check (value_key ~ '^[a-z0-9-]{1,48}$'),
  kind text not null check (kind in ('habit','boundary','goal','social')),
  next_step text not null check (char_length(btrim(next_step)) between 1 and 140),
  habit_id uuid,
  goal_id uuid,
  exercise_id uuid,
  created_at timestamptz not null default now(),
  unique (assessment_id, value_key, kind),
  foreign key (assessment_id, user_id) references public.growth_exercises (id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.growth_exercises (id, user_id) on delete cascade,
  foreign key (habit_id, user_id) references public.growth_habits (id, user_id) on delete cascade,
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade,
  check (num_nonnulls(habit_id, goal_id, exercise_id) = 1 and
    case kind when 'habit' then habit_id is not null when 'goal' then goal_id is not null else exercise_id is not null end)
);
create index values_practices_owner on public.values_practices (user_id, created_at desc);
create index values_practices_habit on public.values_practices (habit_id, user_id) where habit_id is not null;
create index values_practices_goal on public.values_practices (goal_id, user_id) where goal_id is not null;
create index values_practices_exercise on public.values_practices (exercise_id, user_id) where exercise_id is not null;

alter table public.values_practices enable row level security;
revoke all on public.values_practices from public, anon, authenticated, service_role;
grant select, insert, delete on public.values_practices to authenticated;
create policy values_owner_read on public.values_practices for select to authenticated using (user_id = (select auth.uid()));
create policy values_owner_delete on public.values_practices for delete to authenticated using (user_id = (select auth.uid()));
create policy values_owner_insert on public.values_practices for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.growth_exercises assessment where assessment.id = assessment_id
      and assessment.user_id = (select auth.uid()) and assessment.module_slug = 'values-assessment'
      and assessment.completed_at is not null and assessment.answers->'ranked' ? value_key
  ) and (exercise_id is null or exists (
    select 1 from public.growth_exercises target where target.id = exercise_id and target.user_id = (select auth.uid())
      and target.module_slug = case kind when 'boundary' then 'boundary-builder' else 'social-integration' end
  ))
);

create function public.connect_values_practice(assessment_uuid uuid, core_value text, practice_kind text, next_step text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  target_id uuid;
  connection_id uuid;
  target_slug text;
begin
  if owner_id is null or practice_kind not in ('habit','boundary','goal','social')
    or next_step is null or char_length(btrim(next_step)) not between 1 and 140
    or (practice_kind = 'habit' and char_length(btrim(next_step)) > 80) then
    raise exception 'Invalid values practice' using errcode = '22023';
  end if;
  perform 1 from public.growth_exercises
    where id = assessment_uuid and user_id = owner_id and module_slug = 'values-assessment'
      and completed_at is not null and answers->'ranked' ? core_value for update;
  if not found then raise exception 'Assessment unavailable' using errcode = '42501'; end if;

  select id into connection_id from public.values_practices
    where assessment_id = assessment_uuid and value_key = core_value and kind = practice_kind and user_id = owner_id;
  if found then return connection_id; end if;

  if practice_kind = 'habit' then
    insert into public.growth_habits (user_id, title) values (owner_id, btrim(next_step)) returning id into target_id;
  elsif practice_kind = 'goal' then
    insert into public.goals (user_id, title) values (owner_id, btrim(next_step)) returning id into target_id;
  else
    target_slug := case practice_kind when 'boundary' then 'boundary-builder' else 'social-integration' end;
    insert into public.growth_exercises (user_id, module_slug, answers)
      values (owner_id, target_slug, jsonb_build_object(case practice_kind when 'boundary' then '0' else '1' end, btrim(next_step)))
      on conflict (user_id, module_slug) where is_current do nothing returning id into target_id;
    if target_id is null then
      select id into target_id from public.growth_exercises where user_id = owner_id and module_slug = target_slug and is_current;
    end if;
  end if;

  insert into public.values_practices (user_id, assessment_id, value_key, kind, next_step, habit_id, goal_id, exercise_id)
    values (owner_id, assessment_uuid, core_value, practice_kind, btrim(next_step),
      case when practice_kind = 'habit' then target_id end, case when practice_kind = 'goal' then target_id end,
      case when practice_kind in ('boundary','social') then target_id end)
    returning id into connection_id;
  return connection_id;
end;
$$;
revoke all on function public.connect_values_practice(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.connect_values_practice(uuid, text, text, text) to authenticated;

create or replace function public.export_personal_activity()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'growthProfile', (select jsonb_build_object('timezone', growth_timezone) from public.profiles where id = (select auth.uid())),
    'socialGoals', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by created_at, id) from public.social_goals g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'socialInteractions', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by occurred_at, id) from public.social_interactions g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'notificationPreferences', (select to_jsonb(g) - 'user_id' from public.notification_preferences g where g.user_id = (select auth.uid())),
    'valuesPractices', coalesce((select jsonb_agg(to_jsonb(v) - 'user_id' order by created_at, id) from public.values_practices v where v.user_id = (select auth.uid())), '[]'::jsonb),
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
