begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000501', 'values-first@example.test'),
  ('00000000-0000-4000-8000-000000000502', 'values-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000501';

insert into public.values_assessments (id, answers)
values ('00000000-0000-4000-8000-000000000503',
  '{"format":"values-v1","stage":2,"custom":[],"selected":["kindness"],"shortlist":[],"ranked":[],"responses":{},"statement":""}');
select is((select count(*) from public.values_assessments where is_current), 1::bigint, 'incomplete draft saved');
select throws_ok($$update public.values_assessments set completed_at = now(), is_current = false$$,
  '23514', null, 'draft cannot be completed without ranking and statement');
select throws_ok($$update public.values_assessments set answers = jsonb_set(answers,'{shortlist}','["hope"]')$$,
  '23514', null, 'shortlist must come from selections');
update public.values_assessments set is_current = false, completed_at = now(), answers =
  '{"format":"values-v1","stage":6,"custom":[],"selected":["kindness","honesty","hope","courage","focus","play","learning","justice","rest","presence"],"shortlist":["kindness","honesty","hope","courage","focus","play","learning","justice","rest","presence"],"ranked":["honesty","kindness","hope","courage","focus"],"responses":{"kindness":{"week":"Check in with a friend"}},"statement":"My chosen values"}';
select is((select answers->'ranked'->>0 from public.values_assessments), 'honesty', 'rank order preserved');
insert into public.values_assessments (answers)
values ('{"format":"values-v1","stage":1,"custom":[],"selected":[],"shortlist":[],"ranked":[],"responses":{},"statement":""}');
select is((select count(*) from public.values_assessments), 2::bigint, 'previous completion survives a new draft');
select lives_ok($$select public.connect_values_practice('00000000-0000-4000-8000-000000000503','kindness','habit','Check in with a friend')$$, 'creates linked habit');
select lives_ok($$select public.connect_values_practice('00000000-0000-4000-8000-000000000503','kindness','goal','Plan weekly time to listen')$$, 'creates linked goal');
insert into public.growth_exercises (module_slug, answers) values ('boundary-builder', '{"0":"Existing boundary"}');
select lives_ok($$select public.connect_values_practice('00000000-0000-4000-8000-000000000503','kindness','boundary','Keep an evening free')$$, 'creates linked boundary');
select is((select answers->>'0' from public.growth_exercises where module_slug = 'boundary-builder'), 'Existing boundary', 'link preserves existing exercise');
select is((select next_step from public.values_practices where kind = 'boundary'), 'Keep an evening free', 'linked next step is retained');

select lives_ok($$select public.connect_values_practice('00000000-0000-4000-8000-000000000503','kindness','social','Invite a friend to walk')$$, 'creates linked social draft');
select is(jsonb_array_length(public.export_personal_activity()->'valuesPractices'), 4, 'account export includes connections');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000502';
select is((select count(*) from public.values_practices), 0::bigint, 'connections private to their owner');
select throws_ok($$select public.connect_values_practice('00000000-0000-4000-8000-000000000503','kindness','goal','Forbidden')$$,
  '42501', null, 'another account cannot connect a private value');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000501';
select public.delete_personal_activity();
select is((select count(*) from public.values_practices), 0::bigint, 'connections deleted with personal activity');
select * from finish();
rollback;
