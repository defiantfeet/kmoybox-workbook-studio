-- Structured inventories use the existing owner-only growth_exercises table and personal-data export.
create function public.valid_relationship_inventory(payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not (payload ?& array['format','label','category','ring','ratings','reflections','emotions','intention','reviews'])
    or (payload - array['format','label','category','ring','ratings','reflections','emotions','intention','reviews']) <> '{}'::jsonb
    or payload->>'format' is distinct from 'relationship-v1'
    or jsonb_typeof(payload->'label') is distinct from 'string'
    or char_length(btrim(payload->>'label')) not between 1 and 80
    or jsonb_typeof(payload->'category') is distinct from 'string'
    or payload->>'category' not in ('','Family','Friends','Romantic relationships','Coworkers','Mentors','Acquaintances','Community connections','Professional networks')
    or jsonb_typeof(payload->'ring') is distinct from 'string'
    or payload->>'ring' not in ('','Inner circle','Middle circle','Outer circle')
    or jsonb_typeof(payload->'ratings') is distinct from 'object'
    or jsonb_typeof(payload->'reflections') is distinct from 'object'
    or not public.valid_emotion_labels(payload->'emotions')
    or jsonb_typeof(payload->'intention') is distinct from 'string' or char_length(payload->>'intention') > 2000
    or jsonb_typeof(payload->'reviews') is distinct from 'array' then
    return false;
  end if;
  return jsonb_array_length(payload->'reviews') <= 100 and not exists (
    select from jsonb_each(payload->'ratings') rating
    where rating.key not in ('Emotional safety','Trust','Reciprocity','Communication','Respect','Autonomy','Shared interests',
      'Reliability','Sense of belonging','Ability to be authentic')
      or rating.value not in ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb)
  ) and not exists (
    select from jsonb_each(payload->'reflections') reflection
    where reflection.key not in ('beforeAfter','disagreement','pressure','contribution','improvement','boundaries')
      or jsonb_typeof(reflection.value) <> 'string' or char_length(reflection.value #>> '{}') > 2000
  ) and not exists (
    select from jsonb_array_elements(payload->'reviews') as item(review)
    where jsonb_typeof(review) is distinct from 'object'
      or not (review ?& array['date','intention','note'])
      or (review - array['date','intention','note']) <> '{}'::jsonb
      or jsonb_typeof(review->'date') is distinct from 'string'
      or review->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or not pg_input_is_valid(review->>'date', 'date')
      or jsonb_typeof(review->'intention') is distinct from 'string'
      or char_length(btrim(review->>'intention')) not between 1 and 2000
      or char_length(review->>'intention') > 2000
      or jsonb_typeof(review->'note') is distinct from 'string'
      or char_length(btrim(review->>'note')) not between 1 and 2000
      or char_length(review->>'note') > 2000
  );
exception when invalid_parameter_value or data_exception then
  return false;
end;
$$;
revoke all on function public.valid_relationship_inventory(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_relationship_inventory(jsonb) to authenticated;

create index relationship_inventory_owner_idx on public.growth_exercises (user_id, id)
where module_slug = 'relationship-inventory' and answers->>'format' = 'relationship-v1';

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
