create function public.valid_life_timeline_event(payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  t jsonb;
  fields text[] := array['format','title','timing','category','tone','notes','emotions','future','hidden'];
begin
  if jsonb_typeof(payload) is distinct from 'object' or not (payload ?& fields) or payload - fields <> '{}'::jsonb
    or payload->>'format' is distinct from 'timeline-v1'
    or jsonb_typeof(payload->'title') is distinct from 'string' or char_length(btrim(payload->>'title')) not between 1 and 120
    or not public.valid_social_fields(payload - array['timing','notes','emotions','future','hidden'], array['format','title','category','tone'], 120)
    or payload->>'category' not in ('','Family','Education','Relationships','Career','Personal achievements',
      'Identity development','Loss and change','Creativity','Community','Major transitions','Personal discoveries')
    or payload->>'tone' not in ('','Supportive','Challenging','Mixed','Uncertain')
    or jsonb_typeof(payload->'future') is distinct from 'boolean' or jsonb_typeof(payload->'hidden') is distinct from 'boolean'
    or not public.valid_social_fields(payload->'notes', array['description','meaning','lessons','values','identity'])
    or not public.valid_emotion_labels(payload->'emotions')
    or jsonb_typeof(payload->'timing') is distinct from 'object' then return false; end if;
  t := payload->'timing';
  case t->>'mode'
    when 'exact' then
      return (t ? 'date') and public.valid_social_fields(t,array['mode','date'],10)
        and t->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(t->>'date','date');
    when 'approximate' then
      return (t ?& array['year','month']) and public.valid_social_fields(t,array['mode','year','month'],12)
        and t->>'year' ~ '^[1-9][0-9]{3}$' and t->>'month' ~ '^(0[1-9]|1[0-2])?$';
    when 'age' then
      if not (t ?& array['start','end']) or t - array['mode','start','end'] <> '{}'::jsonb
        or jsonb_typeof(t->'start') <> 'number' or jsonb_typeof(t->'end') <> 'number'
        or t->>'start' !~ '^[0-9]{1,3}$' or t->>'end' !~ '^[0-9]{1,3}$' then return false; end if;
      return (t->>'start')::int <= (t->>'end')::int and (t->>'end')::int <= 150;
    when 'chapter' then
      return (t ? 'label') and public.valid_social_fields(t,array['mode','label'],120);
    else return false;
  end case;
exception when data_exception then return false;
end;
$$;
revoke all on function public.valid_life_timeline_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.valid_life_timeline_event(jsonb) to authenticated;

create table public.timeline_images (
  event_id uuid primary key,
  user_id uuid not null default auth.uid(),
  mime_type text not null,
  content bytea not null,
  foreign key (event_id, user_id) references public.growth_exercises(id, user_id) on delete cascade,
  check (octet_length(content) between 12 and 524288),
  check (case mime_type
    when 'image/png' then substring(content from 1 for 8) = decode('89504e470d0a1a0a','hex')
    when 'image/jpeg' then substring(content from 1 for 3) = decode('ffd8ff','hex')
    when 'image/webp' then substring(content from 1 for 4) = decode('52494646','hex')
      and substring(content from 9 for 4) = decode('57454250','hex')
    else false end)
);
create index timeline_images_owner_idx on public.timeline_images(user_id);
create index life_timeline_owner_idx on public.growth_exercises(user_id, created_at, id)
where module_slug = 'life-timeline' and answers->>'format' = 'timeline-v1';

alter table public.timeline_images enable row level security;
revoke all on public.timeline_images from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.timeline_images to authenticated;
create policy timeline_images_owner on public.timeline_images for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists (
  select from public.growth_exercises e where e.id = event_id and e.user_id = (select auth.uid())
    and e.module_slug = 'life-timeline' and e.answers->>'format' = 'timeline-v1'
));

create function public.save_timeline_event(entry_id uuid, expected_revision timestamptz, event_answers jsonb,
  image_data text, image_type text, remove_image boolean)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  event_uuid uuid;
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  if not public.valid_life_timeline_event(event_answers)
    or (image_data is null) <> (image_type is null) or length(image_data) > 699052 then
    raise exception 'Invalid event or image' using errcode = '23514';
  end if;
  if entry_id is null then
    insert into public.growth_exercises (user_id,module_slug,answers,is_current,completed_at)
    values (owner_id,'life-timeline',event_answers,false,statement_timestamp()) returning id into event_uuid;
  else
    update public.growth_exercises set answers = event_answers, updated_at = statement_timestamp()
      where id = entry_id and user_id = owner_id and module_slug = 'life-timeline'
        and answers->>'format' = 'timeline-v1' and updated_at = expected_revision returning id into event_uuid;
    if not found then raise exception 'Event is unavailable or changed' using errcode = '40001'; end if;
  end if;
  if image_data is not null then
    insert into public.timeline_images(event_id,user_id,mime_type,content)
    values(event_uuid,owner_id,image_type,decode(image_data,'base64'))
    on conflict (event_id) do update set mime_type = excluded.mime_type, content = excluded.content;
  elsif remove_image then
    delete from public.timeline_images where event_id = event_uuid and user_id = owner_id;
  end if;
  return event_uuid;
end;
$$;
revoke all on function public.save_timeline_event(uuid,timestamptz,jsonb,text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.save_timeline_event(uuid,timestamptz,jsonb,text,text,boolean) to authenticated;

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
  if new.module_slug = 'life-timeline' and new.answers->>'format' = 'timeline-v1' then
    if not public.valid_life_timeline_event(new.answers) or new.is_current or new.completed_at is null then
      raise exception 'Invalid life timeline event' using errcode = '23514';
    end if;
    return new;
  end if;
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
    'timelineImages', coalesce((select jsonb_agg(jsonb_build_object('eventId', i.event_id, 'mimeType', i.mime_type,
      'base64', replace(encode(i.content,'base64'),chr(10),'')) order by i.event_id)
      from public.timeline_images i where i.user_id = (select auth.uid())), '[]'::jsonb),
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
