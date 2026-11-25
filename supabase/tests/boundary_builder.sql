begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000001201', 'boundary-first@example.test'),
  ('00000000-0000-4000-8000-000000001202', 'boundary-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001201';
insert into public.boundary_entries (id, answers) values
  ('00000000-0000-4000-8000-000000001203', '{"format":"boundary-v1","category":"Time","zone":"","safety":"unsafe","notes":{"situation":"Private"},"script":"","followUpDate":"","relationshipId":""}');
select is((select count(*) from public.boundary_entries where is_current), 1::bigint, 'private draft saved');
select throws_ok($$update public.boundary_entries set is_current = false, completed_at = now()$$,
  '23514', null, 'saving requires a group');
update public.boundary_entries set is_current = false, completed_at = now(), answers = jsonb_set(
  jsonb_set(answers,'{zone}','"Conditional or negotiable"'),'{followUpDate}','"2026-01-01"');
select is((select answers->>'followUpDate' from public.boundary_entries), '2026-01-01', 'follow-up date saved');
select throws_ok($$insert into public.boundary_practice_entries (boundary_id,occurred_on,practice)
  values ('00000000-0000-4000-8000-000000001203', current_date + 10, 'Invalid')$$,
  '42501', null, 'future practice dates rejected');
insert into public.boundary_practice_entries (boundary_id,occurred_on,practice)
values ('00000000-0000-4000-8000-000000001203', public.growth_local_day(auth.uid()), 'Private journal note');
select is(jsonb_array_length(public.export_personal_activity()->'boundaryPracticeEntries'), 1, 'export contains practice notes');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001202';
select is((select count(*) from public.boundary_entries), 0::bigint, 'other users cannot read boundaries');
select is((select count(*) from public.boundary_practice_entries), 0::bigint, 'other users cannot read practice notes');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001201';
select public.delete_personal_activity();
select is((select count(*) from public.boundary_practice_entries), 0::bigint, 'activity reset cascades to practice notes');
select * from finish();
rollback;
