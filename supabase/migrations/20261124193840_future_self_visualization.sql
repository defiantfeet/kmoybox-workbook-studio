create function public.valid_future_self(payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  origin_day date;
  target_day date;
  choice text;
  horizon_span interval;
  field_names text[] := array['format','origin','target','horizon','customDate','reflectionDate','sections','prompts','letter','board'];
begin
  if jsonb_typeof(payload) is distinct from 'object' or not (payload ?& field_names)
    or payload - field_names <> '{}'::jsonb or payload->>'format' is distinct from 'future-v1'
    or not public.valid_social_fields(payload->'sections', array['identity','emotions','relationships','career','finances',
      'physical','creativity','community','lifestyle','purpose'])
    or not public.valid_social_fields(payload->'prompts', array['becoming','values','day','relationships','society','habits','obstacles','support','action'])
    or jsonb_typeof(payload->'letter') is distinct from 'string' or char_length(payload->>'letter') > 8000
    or jsonb_typeof(payload->'board') is distinct from 'array'
    or not public.valid_social_fields(payload - array['sections','prompts','letter','board'],
      array['format','origin','target','horizon','customDate','reflectionDate'], 20) then return false; end if;

  if jsonb_array_length(payload->'board') > 8 or exists (
    select from jsonb_array_elements(payload->'board') as card(value)
    where jsonb_typeof(value) <> 'string' or char_length(btrim(value #>> '{}')) = 0 or char_length(value #>> '{}') > 300
  ) or exists (
    select from jsonb_each_text(payload) as entry(key,value)
    where key in ('origin','target','customDate','reflectionDate')
      and (key in ('origin','target') or value <> '')
      and (value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not pg_input_is_valid(value,'date'))
  ) then return false; end if;
  origin_day := (payload->>'origin')::date;
  target_day := (payload->>'target')::date;
  if target_day < origin_day or nullif(payload->>'reflectionDate','')::date < origin_day then return false; end if;
  choice := payload->>'horizon';
  if choice = 'Custom date' then return payload->>'customDate' = payload->>'target'; end if;
  horizon_span := case choice when '30 days' then interval '30 days' when '90 days' then interval '90 days'
    when '6 months' then interval '6 months' when '1 year' then interval '1 year'
    when '3 years' then interval '3 years' when '5 years' then interval '5 years' end;
  return horizon_span is not null and payload->>'customDate' = '' and target_day = (origin_day + horizon_span)::date;
exception when data_exception then
  return false;
end;
$$;
revoke all on function public.valid_future_self(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_future_self(jsonb) to authenticated;

create index future_self_review_date on public.growth_exercises (user_id, (answers->>'reflectionDate'), id)
where module_slug = 'future-self-visualization' and answers->>'format' = 'future-v1' and answers->>'reflectionDate' <> '';

create function public.create_future_self_goal(goal_title text, target_day date, milestone_titles text[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  goal_uuid uuid;
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  if goal_title is null or char_length(btrim(goal_title)) not between 1 and 140
    or milestone_titles is null or cardinality(milestone_titles) > 5
    or exists (select from unnest(milestone_titles) as item(title)
      where title is null or char_length(btrim(title)) not between 1 and 140)
    then raise exception 'Invalid goal or milestones' using errcode = '23514'; end if;
  insert into public.goals (user_id,title,target_date) values (owner_id,btrim(goal_title),target_day) returning id into goal_uuid;
  insert into public.goal_milestones (user_id,goal_id,title)
  select owner_id,goal_uuid,btrim(title) from unnest(milestone_titles) as item(title);
  return goal_uuid;
end;
$$;
revoke all on function public.create_future_self_goal(text,date,text[]) from public, anon, authenticated, service_role;
grant execute on function public.create_future_self_goal(text,date,text[]) to authenticated;

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
  if new.module_slug = 'future-self-visualization' and new.answers->>'format' = 'future-v1' then
    if not public.valid_future_self(new.answers) or new.is_current or new.completed_at is null then
      raise exception 'Invalid future-self reflection' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug = 'body-awareness-map' and new.answers->>'format' = 'body-v1' then
    if not public.valid_body_awareness(new.answers) or new.is_current or new.completed_at is null then
      raise exception 'Invalid body awareness observation' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug = 'social-integration' and new.answers->>'format' = 'social-v1' then
    if not public.valid_social_exercise(new.answers) or new.is_current or new.completed_at is not null then
      raise exception 'Invalid social exercise' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.module_slug = 'relationship-inventory' and new.answers->>'format' = 'relationship-v1' then
    if not public.valid_relationship_inventory(new.answers) or new.is_current or new.completed_at is null then
      raise exception 'Invalid relationship inventory' using errcode = '23514';
    end if;
    return new;
  end if;
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
