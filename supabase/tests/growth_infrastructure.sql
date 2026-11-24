begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000101', 'growth-owner@example.test'),
  ('00000000-0000-4000-8000-000000000102', 'growth-other@example.test');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';

update public.growth_profiles set growth_timezone = 'Pacific/Kiritimati';
select is(public.growth_local_day(auth.uid()), (statement_timestamp() at time zone 'Pacific/Kiritimati')::date, 'daily date uses the selected timezone');
select throws_ok($$update public.growth_profiles set growth_timezone = 'not/a-timezone'$$, '22023', null, 'invalid zone rejected');
insert into public.mood_checkins (slot, mood, note) values ('daily', 'Calm', 'private mood note');
select is((select local_date from public.mood_checkins), public.growth_local_day(auth.uid()), 'new check-in defaults to owner local date');
select throws_ok($$insert into public.mood_checkins (local_date, slot, mood)
  values (public.growth_local_day(auth.uid()) + 1, 'daily', 'Calm')$$, '23514', null, 'future check-in rejected');
update public.growth_profiles set growth_timezone = 'Etc/GMT+12';
update public.mood_checkins set mood = 'Hopeful';
select is((select timezone from public.mood_checkins), 'Pacific/Kiritimati', 'timezone change preserves the check-in snapshot');

insert into public.boundary_entries (answers) values ('{"0":"draft"}');
select is((select module_slug from public.boundary_entries), 'boundary-builder', 'exercise view chooses its own module');
select throws_ok($$insert into public.boundary_entries (module_slug, answers) values ('life-timeline', '{}')$$,
  '44000', null, 'exercise view rejects a different module');
select throws_ok($$update public.boundary_entries set completed_at = now()$$, '23514', null, 'partial response cannot be completed');
update public.boundary_entries set answers = '{"0":"first","1":"second","2":"third"}', completed_at = now();
update public.boundary_entries set answers = '{"0":"new draft"}', completed_at = null where is_current;
select is((select count(*) from public.boundary_entries), 2::bigint, 'new draft preserves the previous completion');
select is((select answers->>'0' from public.boundary_entries where not is_current), 'first', 'history retains the original answer');
select is((select count(distinct id) from public.boundary_entries), 2::bigint, 'history records have stable UUID identity');

insert into public.growth_goals (id, user_id, title)
values ('00000000-0000-4000-8000-000000000103', auth.uid(), 'Private goal');
insert into public.social_goals (id, goal_id)
values ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000103');
insert into public.social_interactions (social_goal_id, reflection)
values ('00000000-0000-4000-8000-000000000104', 'private reflection');
insert into public.notification_preferences (daily_check_in_enabled, daily_check_in_time) values (true, '09:00');
insert into public.habits (id, title) values ('00000000-0000-4000-8000-000000000105', 'Private habit');
insert into public.habit_logs (habit_id, local_date) values ('00000000-0000-4000-8000-000000000105', public.growth_local_day(auth.uid()));
insert into public.weekly_reflections (week_start, answers)
values (date_trunc('week', public.growth_local_day(auth.uid())::timestamp)::date, '{"0":"weekly reflection"}');

select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'), 2, 'export includes current and historical exercises');
select is(jsonb_array_length(public.export_personal_activity()->'socialInteractions'), 1, 'export includes private interactions');
select is(public.export_personal_activity()->'notificationPreferences'->>'daily_check_in_enabled', 'true', 'export includes reminder preferences');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000102';

select is((select count(*) from public.growth_profiles where id = '00000000-0000-4000-8000-000000000101'), 0::bigint, 'other profile is private');
select is((select count(*) from public.growth_goals), 0::bigint, 'other goals are private');
select is((select count(*) from public.boundary_entries), 0::bigint, 'other draft and history are private through module view');
select is((select count(*) from public.growth_exercises), 0::bigint, 'other drafts are private through the base table');
select is((select count(*) from public.mood_checkins), 0::bigint, 'other mood check-ins are private');
select is((select count(*) from public.habits), 0::bigint, 'other habits are private');
select is((select count(*) from public.habit_logs), 0::bigint, 'other logs are private');
select is((select count(*) from public.weekly_reflections), 0::bigint, 'other weekly reflections are private');
select is((select count(*) from public.social_goals), 0::bigint, 'other social goals are private');
select is((select count(*) from public.social_interactions), 0::bigint, 'other interactions are private');
select is((select count(*) from public.notification_preferences), 0::bigint, 'other notification preferences are private');
with changed as (update public.boundary_entries set answers = '{}' returning id)
select is((select count(*) from changed), 0::bigint, 'another user cannot update an exercise');
with deleted as (delete from public.social_interactions returning id)
select is((select count(*) from deleted), 0::bigint, 'another user cannot delete an interaction');
select throws_ok($$insert into public.thought_records (user_id, answers) values
  ('00000000-0000-4000-8000-000000000101', '{}')$$, '42501', null, 'a user cannot impersonate another owner');
select throws_ok($$insert into public.social_interactions (social_goal_id) values
  ('00000000-0000-4000-8000-000000000104')$$, '23503', null, 'a user cannot link another owner’s social goal');
select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'), 0, 'other exercises excluded from export');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';
select public.delete_personal_activity();
select is((select count(*) from public.growth_exercises), 0::bigint, 'reset clears current and historical exercises');
select is((select count(*) from public.social_interactions), 0::bigint, 'reset clears social interactions');
select is((select count(*) from public.social_goals), 0::bigint, 'reset clears social goal metadata');
select is((select count(*) from public.notification_preferences), 0::bigint, 'reset clears reminder preferences');
select is((select growth_timezone from public.growth_profiles), 'America/Los_Angeles', 'reset restores the default timezone');

reset role;
set local role anon;
select throws_ok('select * from public.thought_records', '42501', null, 'anonymous cannot read exercise views');
select throws_ok('select * from public.notification_preferences', '42501', null, 'anonymous cannot read notification preferences');
reset role;
set local role service_role;
select throws_ok('select * from public.growth_exercises', '42501', null, 'application service role has no growth exercise grant');
select * from finish();
rollback;
