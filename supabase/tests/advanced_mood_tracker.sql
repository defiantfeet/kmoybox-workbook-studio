begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000001901','mood-first@example.test'),
  ('00000000-0000-4000-8000-000000001902','mood-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001901';
select public.save_mood_preferences('Pacific/Kiritimati',
  '{"times":{"morning":"08:00","midday":"12:00","afternoon":"16:00","evening":null},"days":[1,3,5],
  "reminders":true,"quietStart":"22:00","quietEnd":"07:00"}');
select is((select growth_timezone from public.profiles where id=auth.uid()),'Pacific/Kiritimati','preferences update the owner calendar timezone');
select is((select mood_preferences->'times'->>'afternoon' from public.notification_preferences),'16:00','schedule persists');
insert into public.mood_checkins (slot,mood_rating,energy_rating,occurred_at) values
  (null,1,3,'2026-01-01 11:00:00Z'), (null,7,8,'2026-01-01 12:00:00Z'),
  ('afternoon',5,null,'2026-01-01 13:00:00Z'), ('morning',6,null,'2026-01-01 14:00:00Z');
select is((select count(*) from public.mood_checkins where local_date='2026-01-02'),4::bigint,'multiple observations share the recorded local date');
select is((select count(*) from public.mood_checkins where slot is null),2::bigint,'voluntary check-ins are separate rows');
select is((select min(mood_rating)::integer from public.mood_checkins),1,'low ratings remain literal observations');
select throws_ok($$insert into public.mood_checkins (slot,mood_rating,occurred_at) values ('afternoon',7,'2026-01-01 15:00:00Z')$$,
  '23505', null, 'repeated scheduled check-in is rejected');
select throws_ok($$update public.mood_checkins set occurred_at='2026-01-01 05:00:00Z'$$,
  '23514', null, 'recorded instants are stable on edit');
select public.save_mood_preferences('America/Los_Angeles',(select mood_preferences from public.notification_preferences));
update public.mood_checkins set note='Updated' where mood_rating=1;
select is((select timezone from public.mood_checkins where mood_rating=1),'Pacific/Kiritimati','edits preserve the original timezone');
insert into public.mood_checkins (slot,mood_rating,occurred_at) values (null,4,'2026-03-08 07:30:00Z'),(null,8,'2026-03-08 10:30:00Z');
select is((select local_date::text from public.mood_checkins where mood_rating=4),'2026-03-07','local date is correct before the DST transition');
select is((select local_date::text from public.mood_checkins where mood_rating=8),'2026-03-08','local date is correct after the DST transition');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001902';
select is((select count(*) from public.mood_checkins),0::bigint,'other users cannot retrieve these observations');
select is((select count(*) from public.notification_preferences),0::bigint,'other users cannot retrieve reminder preferences');
select * from finish();
rollback;
