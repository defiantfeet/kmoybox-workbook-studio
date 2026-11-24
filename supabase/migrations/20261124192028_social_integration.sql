-- Reuse the existing private exercise, goals, and interaction records.
alter table public.social_goals
  add column status text not null default 'Active' check (status in ('Active','Postponed','Declined','Completed')),
  add column notes text not null default '' check (char_length(notes) <= 2000),
  add column updated_at timestamptz not null default now();

create function public.valid_social_fields(payload jsonb, allowed text[], max_length integer default 2000)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(payload) is distinct from 'object' then return false; end if;
  return not exists (
    select from jsonb_each(payload) as field(key, value)
    where not (key = any(allowed)) or jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > max_length
  );
end;
$$;

alter table public.social_interactions
  add column local_date date,
  add column updated_at timestamptz not null default now(),
  add column details jsonb not null default '{}'::jsonb,
  add constraint social_interaction_details check (
    public.valid_social_fields(details, array['0','1','2','3','4','5','6','7','8','9','10'])
    and (details = '{}'::jsonb or (local_date is not null and coalesce(btrim(details->>'0'), '') <> ''))
  );
revoke all on function public.valid_social_fields(jsonb, text[], integer) from public, anon, authenticated, service_role;
grant execute on function public.valid_social_fields(jsonb, text[], integer) to authenticated;

create function public.valid_social_exercise(payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  kind text := payload->>'kind';
  entry_key text := payload->>'key';
  fields jsonb := payload->'fields';
begin
  if jsonb_typeof(payload) is distinct from 'object' or not (payload ?& array['format','kind','key','fields'])
    or (payload - array['format','kind','key','fields']) <> '{}'::jsonb
    or jsonb_typeof(payload->'kind') is distinct from 'string' or jsonb_typeof(payload->'key') is distinct from 'string'
    or jsonb_typeof(fields) is distinct from 'object' then return false; end if;
  case kind
    when 'awareness' then
      return entry_key = '' and public.valid_social_fields(fields, array['0','1','2','3','4','5','6','7']);
    when 'expectations' then
      return entry_key = '' and public.valid_social_fields(fields, array['0','1','2','3','4','5','6','7','8']);
    when 'ecosystem' then
      return entry_key = '' and public.valid_social_fields(fields, array['label0','label1','label2','label3','label4','label5',
        'notes0','notes1','notes2','notes3','notes4','notes5'])
        and not exists (select from jsonb_each_text(fields) where key like 'label%' and char_length(value) > 50);
    when 'weekly' then
      return entry_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(entry_key, 'date')
        and extract(isodow from entry_key::date) = 1 and public.valid_social_fields(fields, array['0','1','2','3','4','5']);
    when 'practice' then
      return entry_key ~ '^[0-9]$' and public.valid_social_fields(fields, array['0','1','2']);
    when 'community' then
      return entry_key = '' and public.valid_social_fields(fields, array['idea','0','1','2','3'])
        and coalesce(fields->>'idea','') in ('','Dance classes','Book clubs','Volunteer opportunities','Professional organizations',
          'Educational events','Creative communities','Cultural organizations','Recreational activities');
    when 'progress' then
      return entry_key = '' and public.valid_social_fields(fields,
        array['awareness','ecosystem','practice','community','goals','journal','expectations','weekly'], 3)
        and not exists (select from jsonb_each_text(fields) where value <> 'yes');
    else return false;
  end case;
exception when data_exception then
  return false;
end;
$$;
revoke all on function public.valid_social_exercise(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_social_exercise(jsonb) to authenticated;

create index social_exercise_lookup on public.growth_exercises (user_id, (answers->>'kind'), updated_at desc, id)
where module_slug = 'social-integration' and answers->>'format' = 'social-v1';
create unique index social_exercise_single_entry on public.growth_exercises (user_id, (answers->>'kind'), (answers->>'key'))
where module_slug = 'social-integration' and answers->>'format' = 'social-v1' and answers->>'kind' <> 'community';

create function public.save_social_goal(entry_id uuid, expected_revision timestamptz, goal_title text, target_day date,
  goal_status text, private_notes text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  base_id uuid;
  result_id uuid;
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  if goal_status is null or goal_status not in ('Active','Postponed','Declined','Completed')
    or goal_title is null or char_length(btrim(goal_title)) not between 1 and 140
    or private_notes is null or char_length(private_notes) > 2000 then
    raise exception 'Invalid social goal' using errcode = '23514';
  end if;
  if entry_id is null then
    insert into public.goals (user_id,title,target_date,completed)
    values (owner_id,btrim(goal_title),target_day,goal_status = 'Completed') returning id into base_id;
    insert into public.social_goals (user_id,goal_id,status,notes)
    values (owner_id,base_id,goal_status,private_notes) returning id into result_id;
    return result_id;
  end if;
  update public.social_goals set status = goal_status, notes = private_notes, updated_at = statement_timestamp()
  where id = entry_id and user_id = owner_id and updated_at = expected_revision returning goal_id into base_id;
  if not found then raise exception 'Social goal is unavailable or changed' using errcode = '40001'; end if;
  update public.goals set title = btrim(goal_title), target_date = target_day, completed = (goal_status = 'Completed')
  where id = base_id and user_id = owner_id;
  if not found then raise exception 'Social goal is unavailable' using errcode = '40001'; end if;
  return entry_id;
end;
$$;
revoke all on function public.save_social_goal(uuid,timestamptz,text,date,text,text) from public, anon, authenticated, service_role;
grant execute on function public.save_social_goal(uuid,timestamptz,text,date,text,text) to authenticated;

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
