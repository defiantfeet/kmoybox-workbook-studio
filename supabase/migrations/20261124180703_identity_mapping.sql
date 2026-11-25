create function public.valid_identity_map(payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  node jsonb;
  edge jsonb;
  ids text[] := array[]::text[];
  edges text[] := array[]::text[];
  key text;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or payload->>'format' is distinct from 'identity-v1'
    or jsonb_typeof(payload->'nodes') is distinct from 'array'
    or jsonb_typeof(payload->'connections') is distinct from 'array'
    or jsonb_typeof(payload->'reflections') is distinct from 'object'
    or payload - array['format','nodes','connections','reflections','earlier'] <> '{}'::jsonb
  then return false; end if;
  if payload ? 'earlier' then
    if jsonb_typeof(payload->'earlier') is distinct from 'array' then return false; end if;
    if jsonb_array_length(payload->'earlier') > 3 or exists (
      select from jsonb_array_elements(payload->'earlier') item
      where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 2000
    ) then return false; end if;
  end if;
  if jsonb_array_length(payload->'nodes') > 16 or jsonb_array_length(payload->'connections') > 40
    or exists (
      select from jsonb_each(payload->'reflections') as item(name, answer)
      where name not in ('privateSelf','authentic','restrictive','retain','pressure','belonging')
        or jsonb_typeof(answer) <> 'string' or char_length(answer #>> '{}') > 2000
    )
  then return false; end if;
  for node in select * from jsonb_array_elements(payload->'nodes') loop
    if jsonb_typeof(node) is distinct from 'object'
      or jsonb_typeof(node->'id') is distinct from 'string'
      or node->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or node->>'id' = any(ids)
      or jsonb_typeof(node->'label') is distinct from 'string'
      or char_length(btrim(node->>'label')) not between 1 and 80
      or coalesce(node->>'category','__missing') not in (
        '', 'Personal values', 'Cultural identity', 'Family roles', 'Professional identity', 'Gender and self-expression',
        'Interests and creativity', 'Strengths', 'Life experiences', 'Community affiliations', 'Societal expectations', 'Future identity'
      ) or coalesce(node->>'classification','__missing') not in (
        '', 'Personally chosen', 'Inherited', 'Socially assigned', 'Currently exploring', 'No longer identifies with'
      )
      or node - array['id','label','category','classification'] <> '{}'::jsonb
    then return false; end if;
    ids := array_append(ids, node->>'id');
  end loop;
  for edge in select * from jsonb_array_elements(payload->'connections') loop
    if jsonb_typeof(edge) is distinct from 'array' then return false; end if;
    if jsonb_array_length(edge) <> 2 or jsonb_typeof(edge->0) is distinct from 'string'
      or jsonb_typeof(edge->1) is distinct from 'string' or edge->>0 >= edge->>1
      or not (edge->>0 = any(ids) and edge->>1 = any(ids))
    then return false; end if;
    key := (edge->>0) || '/' || (edge->>1);
    if key = any(edges) then return false; end if;
    edges := array_append(edges, key);
  end loop;
  return true;
end;
$$;

revoke all on function public.valid_identity_map(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_identity_map(jsonb) to authenticated;

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
