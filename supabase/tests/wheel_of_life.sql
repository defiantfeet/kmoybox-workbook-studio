begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000401', 'wheel-first@example.test'),
  ('00000000-0000-4000-8000-000000000402', 'wheel-second@example.test');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000401';
insert into public.wheel_of_life_entries (answers) values
  ('{"domains":[{"id":"growth","label":"Personal growth","rating":null,"priority":true,"note":"Private"}]}');
select is((select count(*) from public.wheel_of_life_entries where is_current), 1::bigint, 'partial draft saved');
select throws_ok($$update public.wheel_of_life_entries set completed_at = now(), is_current = false$$,
  '23514', null, 'completion requires every rating');
select throws_ok($$update public.wheel_of_life_entries set answers =
  '{"domains":[{"id":"growth","label":"Growth","rating":11,"priority":true,"note":""}]}'$$,
  '23514', null, 'ratings above ten rejected');
update public.wheel_of_life_entries set completed_at = now(), is_current = false, answers =
  '{"domains":[{"id":"growth","label":"Personal growth","rating":7,"priority":true,"note":"Private"}]}';
insert into public.wheel_of_life_entries (completed_at,is_current,answers) values
  (now(), false, '{"domains":[{"id":"growth","label":"Personal growth","rating":8,"priority":false,"note":""}]}');
select is((select count(*) from public.wheel_of_life_entries where completed_at is not null), 2::bigint, 'two completions coexist');
select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'), 2, 'account export includes both assessments');
insert into public.notification_preferences (wheel_reminder_since) values (current_date);
select ok((select wheel_reminder_since is not null from public.notification_preferences), 'owner can opt into reminders');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000402';
select is((select count(*) from public.wheel_of_life_entries), 0::bigint, 'other account cannot see Wheel records');
select is((select count(*) from public.notification_preferences), 0::bigint, 'other account cannot see reminder preference');
select * from finish();
rollback;
