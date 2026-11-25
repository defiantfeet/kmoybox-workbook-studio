begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000071', 'growth-one@example.test'),
  ('00000000-0000-4000-8000-000000000072', 'growth-two@example.test');

set local role anon;
select throws_ok('select * from public.growth_exercises', '42501', null, 'anonymous users cannot read exercises');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000071';

insert into public.growth_exercises (user_id, module_slug, answers)
values (auth.uid(), 'boundary-builder', '{"0":"Private draft"}');
insert into public.growth_check_ins (user_id, local_date, slot, mood)
values (auth.uid(), (now() at time zone 'America/Los_Angeles')::date, 'daily', 'Calm');
insert into public.growth_weekly_reflections (user_id, week_start, answers)
values (auth.uid(), date_trunc('week', now() at time zone 'America/Los_Angeles')::date, '{"0":"Private reflection"}');
insert into public.growth_habits (id, user_id, title)
values ('00000000-0000-4000-8000-000000000073', auth.uid(), 'Private habit');
insert into public.growth_habit_logs (habit_id, user_id, local_date)
values ('00000000-0000-4000-8000-000000000073', auth.uid(), (now() at time zone 'America/Los_Angeles')::date)
on conflict do nothing;
insert into public.growth_habit_logs (habit_id, user_id, local_date)
values ('00000000-0000-4000-8000-000000000073', auth.uid(), (now() at time zone 'America/Los_Angeles')::date)
on conflict do nothing;

select is((select count(*) from public.growth_habit_logs), 1::bigint, 'check-in replay keeps one habit log');
select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'), 1, 'owner export includes the exercise');
select is(jsonb_array_length(public.export_personal_activity()->'growthHabitLogs'), 1, 'owner export includes the habit log');
select throws_ok(
  $$update public.growth_habits set user_id = '00000000-0000-4000-8000-000000000072'$$,
  '42501', null, 'ownership cannot be reassigned'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000072';
select is((select count(*) from public.growth_exercises), 0::bigint, 'other exercises are hidden');
select is((select count(*) from public.growth_check_ins), 0::bigint, 'other moods are hidden');
select is((select count(*) from public.growth_weekly_reflections), 0::bigint, 'other reflections are hidden');
select is((select count(*) from public.growth_habits), 0::bigint, 'other habits are hidden');
select is((select count(*) from public.growth_habit_logs), 0::bigint, 'other habit logs are hidden');
select throws_ok(
  $$insert into public.growth_habit_logs (habit_id, user_id, local_date)
    values ('00000000-0000-4000-8000-000000000073', auth.uid(), (now() at time zone 'America/Los_Angeles')::date)$$,
  '23514', null, 'a user cannot write a log for another owner’s habit'
);
select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'), 0, 'other exercises are excluded from export');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000071';
select public.delete_personal_activity();
select is((
  select count(*) from jsonb_each(public.export_personal_activity()) where key in ('growthExercises', 'growthCheckIns', 'growthWeeklyReflections', 'growthHabits', 'growthHabitLogs') and value <> '[]'::jsonb
), 0::bigint, 'reset clears all growth data');

insert into public.growth_habits (user_id, title) values (auth.uid(), 'Cascade habit');
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000071';
select is((select count(*) from public.growth_habits), 0::bigint, 'account deletion cascades to growth data');
select * from finish();
rollback;
