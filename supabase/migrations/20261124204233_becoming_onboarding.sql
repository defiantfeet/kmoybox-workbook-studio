create function public.valid_growth_onboarding(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  keys text[] := array['topics','goals','frequency','times','participation','accessibility','duration','reminders'];
  item jsonb;
begin
  if jsonb_typeof(value) is distinct from 'object' or not (value ?& keys) or value - keys <> '{}'::jsonb
    or not public.valid_social_fields(value - array['topics','goals','times','accessibility'],
      array['frequency','participation','duration','reminders'], 40)
    or value->>'frequency' not in ('','Whenever I choose','Daily','A few times a week','Weekly','Monthly')
    or value->>'participation' not in ('','Mostly on my own','One-to-one connections','Small groups','Community activities','Exploring my options')
    or value->>'duration' not in ('','5 minutes or less','About 10 minutes','About 20 minutes','Flexible')
    or value->>'reminders' not in ('','No reminders','In-app reminders','Decide later')
    or jsonb_typeof(value->'topics') is distinct from 'array'
    or jsonb_typeof(value->'goals') is distinct from 'array'
    or jsonb_typeof(value->'times') is distinct from 'array'
    or jsonb_typeof(value->'accessibility') is distinct from 'array' then return false; end if;
  if jsonb_array_length(value->'topics') > 9 or jsonb_array_length(value->'goals') > 5
    or jsonb_array_length(value->'times') > 4 or jsonb_array_length(value->'accessibility') > 5 then return false; end if;
  for item in select entry from jsonb_array_elements(value->'topics') entry loop
    if jsonb_typeof(item) <> 'string' or item #>> '{}' not in
      ('identity','emotions','relationships','boundaries','belonging','habits','body','future','growth') then return false; end if;
  end loop;
  for item in select entry from jsonb_array_elements(value->'goals') entry loop
    if jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) not between 1 and 160 then return false; end if;
  end loop;
  for item in select entry from jsonb_array_elements(value->'times') entry loop
    if jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
  end loop;
  for item in select entry from jsonb_array_elements(value->'accessibility') entry loop
    if jsonb_typeof(item) <> 'string' or item #>> '{}' not in
      ('Written prompts','Visual tools','Keyboard-first activities','Short steps','Stillness or seated options') then return false; end if;
  end loop;
  return jsonb_array_length(value->'topics') = (select count(distinct entry) from jsonb_array_elements(value->'topics') entry)
    and jsonb_array_length(value->'times') = (select count(distinct entry) from jsonb_array_elements(value->'times') entry)
    and jsonb_array_length(value->'accessibility') = (select count(distinct entry) from jsonb_array_elements(value->'accessibility') entry);
end;
$$;
revoke all on function public.valid_growth_onboarding(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_growth_onboarding(jsonb) to authenticated;

alter table public.notification_preferences
  add column onboarding_status text check (onboarding_status in ('saved','skipped')),
  add column growth_onboarding jsonb check (public.valid_growth_onboarding(growth_onboarding) or growth_onboarding is null),
  add constraint saved_onboarding_contains_preferences check (onboarding_status is distinct from 'saved' or growth_onboarding is not null);
