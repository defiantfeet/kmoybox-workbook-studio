begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000701', 'identity-first@example.test'),
  ('00000000-0000-4000-8000-000000000702', 'identity-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000701';
insert into public.identity_maps (answers)
values ('{"format":"identity-v1","nodes":[],"connections":[],"reflections":{}}');
select is((select count(*) from public.identity_maps where is_current), 1::bigint, 'sensitive responses are all optional');
select throws_ok($$update public.identity_maps set answers = jsonb_set(answers,'{connections}',
  '[["00000000-0000-4000-8000-000000000703","00000000-0000-4000-8000-000000000704"]]')$$,
  '23514', null, 'orphan connections cannot be saved');
update public.identity_maps set is_current = false, completed_at = now(), answers =
  '{"format":"identity-v1","nodes":[{"id":"00000000-0000-4000-8000-000000000703","label":"Private role","category":"","classification":""}],"connections":[],"reflections":{}}';
insert into public.identity_maps (is_current, completed_at, answers)
values (false, now(), '{"format":"identity-v1","nodes":[],"connections":[],"reflections":{"authentic":"Private note"}}');
select is((select count(*) from public.identity_maps where completed_at is not null), 2::bigint, 'dated versions coexist');
select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'), 2, 'account export includes both saved versions');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000702';
select is((select count(*) from public.identity_maps), 0::bigint, 'another member cannot read maps');
with edited as (update public.identity_maps set answers = '{}' returning id)
select is((select count(*) from edited), 0::bigint, 'another member cannot edit maps');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000701';
select public.delete_personal_activity();
select is((select count(*) from public.identity_maps), 0::bigint, 'personal reset removes dated versions');
select * from finish();
rollback;
