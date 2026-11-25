begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000001801','habit-first@example.test'),
  ('00000000-0000-4000-8000-000000001802','habit-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001801';
update public.profiles set growth_timezone='Pacific/Kiritimati' where id=auth.uid();
insert into public.habits(id,title,started_on,schedule,completion_type)
values ('00000000-0000-4000-8000-000000001803','Every other day', public.growth_local_day(auth.uid())-2,
  '{"mode":"custom","every":2,"days":[]}','Minutes');
select is(jsonb_array_length((select schedule_history from public.habits)),1,'initial schedule is recorded');
select throws_ok($$insert into public.habit_logs(habit_id,local_date,state)
values ('00000000-0000-4000-8000-000000001803',public.growth_local_day(auth.uid())-1,'Completed')$$,
  '23514', null, 'unscheduled date is rejected');
select throws_ok($$insert into public.habit_logs(habit_id,local_date,state)
values ('00000000-0000-4000-8000-000000001803',public.growth_local_day(auth.uid())+1,'Completed')$$,
  '23514', null, 'future days in the selected timezone are rejected');
insert into public.growth_habit_logs(habit_id,local_date,state,amount)
values ('00000000-0000-4000-8000-000000001803',public.growth_local_day(auth.uid()),'Partially completed',10);
insert into public.growth_habit_logs(habit_id,local_date,state)
values ('00000000-0000-4000-8000-000000001803',public.growth_local_day(auth.uid()),'Rest day')
on conflict (habit_id,local_date) do update set state=excluded.state, amount=null;
select is((select count(*) from public.habit_logs),1::bigint,'replaying the date updates one row');
select is((select state from public.habit_logs),'Rest day','rest day replaces the previous state');
update public.habits set paused=true;
select is(jsonb_array_length((select schedule_history from public.habits)),2,'pausing keeps the prior schedule');
insert into public.habit_logs(habit_id,local_date,state)
values ('00000000-0000-4000-8000-000000001803',public.growth_local_day(auth.uid())-2,'Skipped');
select is((select count(*) from public.habit_logs),2::bigint,'earlier scheduled opportunities stay editable');
insert into public.habits(title,started_on) values ('Planned habit',public.growth_local_day(auth.uid())+1);
select is((select count(*) from public.habits),2::bigint,'a habit can start on a later date');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001802';
select is((select count(*) from public.habits),0::bigint,'another member cannot read habits');
select is((select count(*) from public.habit_logs),0::bigint,'another member cannot read logs');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001801';
delete from public.habits where id='00000000-0000-4000-8000-000000001803';
select is((select count(*) from public.habit_logs),0::bigint,'deleting a habit cascades to its logs');
select * from finish();
rollback;
