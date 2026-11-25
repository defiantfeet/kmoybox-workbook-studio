begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000801', 'thought-first@example.test'),
  ('00000000-0000-4000-8000-000000000802', 'thought-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000801';
insert into public.thought_records (answers) values
  ('{"format":"thought-v1","stage":2,"date":"","time":"","emotions":["Sad","Anxious"],"before":0,"after":null,"text":{}}');
select is((select (answers->>'before')::int from public.thought_records where is_current), 0, 'zero differs from a skipped rating');
select throws_ok($$update public.thought_records set answers = jsonb_set(answers,'{after}','101')$$,
  '23514', null, 'ratings above 100 rejected');
select throws_ok($$update public.thought_records set answers = jsonb_set(answers,'{date}','"2026-02-30"')$$,
  '23514', null, 'impossible dates rejected');
update public.thought_records set is_current = false, completed_at = now();
insert into public.thought_records (completed_at, is_current, answers) values
  (now(), false, '{"format":"thought-v1","stage":5,"date":"","time":"","emotions":[],"before":null,"after":null,"text":{}}');
select is((select count(*) from public.thought_records where completed_at is not null), 2::bigint, 'completed entries can coexist with all questions skipped');
select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'), 2, 'account export includes completed entries');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000802';
select is((select count(*) from public.thought_records), 0::bigint, 'other accounts cannot read thought records');
with changed as (update public.thought_records set answers = '{}' returning id)
select is((select count(*) from changed), 0::bigint, 'other accounts cannot update thought records');
select * from finish();
rollback;
