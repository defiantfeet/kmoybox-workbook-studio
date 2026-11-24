create function public.valid_mood_details(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(value) is distinct from 'object' or value - array['scales','notes'] <> '{}'::jsonb
    or not public.valid_social_fields(value->'notes', array['sensations','activity','social','environment','needs','journal'])
    or jsonb_typeof(value->'scales') is distinct from 'object' then return false; end if;
  return not exists (select from jsonb_each(value->'scales') item
    where item.key not in ('intensity','stress','sleep','belonging','authenticity')
      or jsonb_typeof(item.value) <> 'number' or item.value::text !~ '^([1-9]|10)$');
end;
$$;

create function public.valid_mood_tags(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  return jsonb_array_length(value) <= 20 and not exists (select from jsonb_array_elements(value) item
    where jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) not between 1 and 40)
    and jsonb_array_length(value) = (select count(distinct lower(btrim(tag))) from jsonb_array_elements_text(value) tag);
end;
$$;

alter table public.growth_check_ins
  alter column slot drop not null,
  alter column mood drop not null,
  drop constraint growth_check_ins_slot_check,
  add constraint growth_check_ins_slot_check check (slot in ('daily','morning','midday','afternoon','evening')),
  add column mood_rating smallint check (mood_rating between 1 and 10),
  add column energy_rating smallint check (energy_rating between 1 and 10),
  add column occurred_at timestamptz,
  add column details jsonb not null default '{"scales":{},"notes":{}}' check (public.valid_mood_details(details)),
  add column context_tags jsonb not null default '[]' check (public.valid_mood_tags(context_tags)),
  add constraint mood_entry_has_observation check (mood is not null or mood_rating is not null),
  add constraint mood_voluntary_timestamp check (slot is not null or occurred_at is not null);

create index growth_check_ins_owner_history_idx on public.growth_check_ins (user_id,local_date desc,occurred_at desc,id);
create or replace view public.mood_checkins with (security_invoker=true) as select * from public.growth_check_ins;

create function public.set_advanced_mood_clock()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.occurred_at,new.local_date,new.timezone,new.slot) is distinct from (old.occurred_at,old.local_date,old.timezone,old.slot) then
      raise exception 'Check-in date and slot are fixed' using errcode = '23514';
    end if;
  elsif new.occurred_at is not null then
    if new.occurred_at > statement_timestamp() + interval '1 minute' then
      raise exception 'Check-in time cannot be in the future' using errcode = '23514';
    end if;
    new.timezone := coalesce((select growth_timezone from public.profiles where id = new.user_id),'America/Los_Angeles');
    new.local_date := (new.occurred_at at time zone new.timezone)::date;
  end if;
  return new;
end;
$$;
-- This runs before the existing calendar trigger, which retains timezone and applies the local-day bound.
create trigger advanced_mood_clock before insert or update on public.growth_check_ins
for each row execute function public.set_advanced_mood_clock();

create function public.valid_mood_preferences(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  clock_format text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  key_name text;
begin
  if jsonb_typeof(value) is distinct from 'object'
    or not (value ?& array['times','days','reminders','quietStart','quietEnd'])
    or value - array['times','days','reminders','quietStart','quietEnd'] <> '{}'::jsonb
    or jsonb_typeof(value->'days') is distinct from 'array'
    or jsonb_typeof(value->'times') is distinct from 'object'
    or not (value->'times' ?& array['morning','midday','afternoon','evening'])
    or (value->'times') - array['morning','midday','afternoon','evening'] <> '{}'::jsonb
    or jsonb_typeof(value->'reminders') is distinct from 'boolean' then return false; end if;
  if jsonb_array_length(value->'days') > 7 or exists(select from jsonb_array_elements(value->'days') day
    where jsonb_typeof(day) <> 'number' or day::text !~ '^[1-7]$')
    or jsonb_array_length(value->'days') <> (select count(distinct day) from jsonb_array_elements(value->'days') day)
    then return false; end if;
  if exists (select from jsonb_each(value->'times') slot
    where slot.value <> 'null'::jsonb and (jsonb_typeof(slot.value) <> 'string' or (slot.value #>> '{}') !~ clock_format))
    then return false; end if;
  foreach key_name in array array['quietStart','quietEnd'] loop
    if value->key_name <> 'null'::jsonb and (jsonb_typeof(value->key_name) <> 'string' or (value->>key_name) !~ clock_format)
    then return false; end if;
  end loop;
  return (value->>'quietStart' is null and value->>'quietEnd' is null)
    or (value->>'quietStart' is not null and value->>'quietEnd' is not null and value->>'quietStart' <> value->>'quietEnd');
end;
$$;

alter table public.notification_preferences add column mood_preferences jsonb
  not null default '{"times":{"morning":"08:00","midday":"12:00","afternoon":"16:00","evening":"20:00"},"days":[1,2,3,4,5,6,7],"reminders":false,"quietStart":null,"quietEnd":null}'
  check (public.valid_mood_preferences(mood_preferences));

create function public.save_mood_preferences(zone text, preferences jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  if not public.valid_mood_preferences(preferences) or not exists (select from pg_timezone_names where name=zone) then
    raise exception 'Invalid mood preferences' using errcode = '23514';
  end if;
  update public.profiles set growth_timezone=zone where id=owner_id;
  if not found then raise exception 'Profile unavailable' using errcode = '42501'; end if;
  insert into public.notification_preferences(user_id,mood_preferences) values(owner_id,preferences)
    on conflict (user_id) do update set mood_preferences=excluded.mood_preferences;
end;
$$;

revoke all on function public.valid_mood_details(jsonb), public.valid_mood_tags(jsonb),
  public.valid_mood_preferences(jsonb), public.set_advanced_mood_clock(), public.save_mood_preferences(text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.valid_mood_details(jsonb), public.valid_mood_tags(jsonb),
  public.valid_mood_preferences(jsonb), public.save_mood_preferences(text,jsonb) to authenticated;
