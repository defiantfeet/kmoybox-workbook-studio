begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000001301', 'relationship-first@example.test'),
  ('00000000-0000-4000-8000-000000001302', 'relationship-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001301';
insert into public.relationship_entries (answers)
values ('{"0":"An earlier private reflection"}');
insert into public.relationship_entries (id, answers, is_current, completed_at)
values ('00000000-0000-4000-8000-000000001303',
  '{"format":"relationship-v1","label":"A.","category":"Friends","ring":"Inner circle","ratings":{},"reflections":{},"emotions":[],"intention":"Go for a walk","reviews":[]}',
  false, now());
select is((select count(*) from public.relationship_entries), 2::bigint, 'structured entry and legacy reflection coexist');
select throws_ok($$update public.relationship_entries set answers = jsonb_set(answers, '{ratings}', '{"Trust":6}')
  where id = '00000000-0000-4000-8000-000000001303'$$, '23514', null, 'ratings outside 1 to 5 are rejected');
select throws_ok($$update public.relationship_entries set answers = jsonb_set(answers, '{reviews}',
  '[{"date":"2026-02-30","intention":"Go for a walk","note":"Private"}]')
  where id = '00000000-0000-4000-8000-000000001303'$$, '23514', null, 'invalid dates are rejected');
update public.relationship_entries set answers = jsonb_set(jsonb_set(answers, '{reviews}',
  '[{"date":"2026-11-24","intention":"Go for a walk","note":"Private"}]'), '{intention}', '"Talk on Saturday"')
where id = '00000000-0000-4000-8000-000000001303';
select is((select answers #>> '{reviews,0,intention}' from public.relationship_entries where answers ? 'format'),
  'Go for a walk', 'a review retains the earlier intention');
select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'), 2, 'the existing export includes both records');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001302';
select is((select count(*) from public.relationship_entries), 0::bigint, 'other users cannot read the inventory');
with changed as (update public.relationship_entries set updated_at = now() returning id)
select is((select count(*) from changed), 0::bigint, 'other users cannot update the inventory');
with deleted as (delete from public.relationship_entries returning id)
select is((select count(*) from deleted), 0::bigint, 'other users cannot delete the inventory');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001301';
select public.delete_personal_activity();
select is((select count(*) from public.relationship_entries), 0::bigint, 'the existing personal-data reset removes inventory records');
select * from finish();
rollback;
