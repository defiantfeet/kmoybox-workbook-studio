create function public.valid_emotion_labels(labels jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(labels) is distinct from 'array' then return false; end if;
  return jsonb_array_length(labels) <= 12 and not exists (
    select from jsonb_array_elements(labels) as item(label)
    where jsonb_typeof(label) <> 'string' or char_length(btrim(label #>> '{}')) not between 1 and 60
  ) and jsonb_array_length(labels) = (
    select count(distinct lower(btrim(label))) from jsonb_array_elements_text(labels) as item(label)
  );
end;
$$;

create function public.valid_emotion_entry(payload jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    jsonb_typeof(payload) = 'object' and public.valid_emotion_labels(payload->'emotions')
    and payload->'emotions' <> '[]'::jsonb
    and (payload->'intensity' = 'null'::jsonb or (
      jsonb_typeof(payload->'intensity') = 'number' and (payload->>'intensity') ~ '^([0-9]|[1-9][0-9]|100)$'
    ))
    and jsonb_typeof(payload->'sensations') = 'string' and char_length(payload->>'sensations') <= 2000
    and jsonb_typeof(payload->'context') = 'string' and char_length(payload->>'context') <= 2000
    and jsonb_typeof(payload->'reflection') = 'string' and char_length(payload->>'reflection') <= 2000
    and payload - array['format','emotions','intensity','sensations','context','reflection'] = '{}'::jsonb,
    false
  );
$$;

revoke all on function public.valid_emotion_labels(jsonb), public.valid_emotion_entry(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_emotion_labels(jsonb), public.valid_emotion_entry(jsonb) to authenticated;

alter table public.growth_check_ins add column emotion_labels jsonb not null default '[]'::jsonb
  check (public.valid_emotion_labels(emotion_labels));

create or replace view public.mood_checkins with (security_invoker = true) as select * from public.growth_check_ins;

create or replace function public.valid_thought_record(payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  rating_key text;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or payload->>'format' is distinct from 'thought-v1'
    or jsonb_typeof(payload->'stage') is distinct from 'number'
    or not coalesce(payload->>'stage' ~ '^[1-5]$', false)
    or jsonb_typeof(payload->'date') is distinct from 'string'
    or payload->>'date' !~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})?$'
    or jsonb_typeof(payload->'time') is distinct from 'string'
    or payload->>'time' !~ '^(([01][0-9]|2[0-3]):[0-5][0-9])?$'
    or jsonb_typeof(payload->'emotions') is distinct from 'array'
    or jsonb_typeof(payload->'text') is distinct from 'object'
    or payload - array['format','stage','date','time','timezone','emotions','before','after','text'] <> '{}'::jsonb
    or (payload ? 'timezone' and (
      jsonb_typeof(payload->'timezone') is distinct from 'string' or char_length(payload->>'timezone') > 100
    ))
  then return false; end if;
  if payload->>'date' <> '' then
    begin
      perform (payload->>'date')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      return false;
    end;
  end if;
  foreach rating_key in array array['before','after'] loop
    if not coalesce(payload->rating_key = 'null'::jsonb or (
      jsonb_typeof(payload->rating_key) = 'number' and payload->>rating_key ~ '^([0-9]|[1-9][0-9]|100)$'
    ), false) then return false; end if;
  end loop;
  return public.valid_emotion_labels(payload->'emotions') and not exists (
    select from jsonb_each(payload->'text') as field(key,value)
    where key not in ('situation','automatic','physical','behavior','supporting','otherEvidence','alternative','balanced','action')
      or jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 2000
  );
end;
$$;

revoke all on function public.valid_thought_record(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_thought_record(jsonb) to authenticated;

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
