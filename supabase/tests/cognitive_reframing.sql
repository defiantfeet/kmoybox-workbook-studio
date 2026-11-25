begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000001001', 'reframe-first@example.test'),
  ('00000000-0000-4000-8000-000000001002', 'reframe-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001001';
insert into public.cognitive_reframes (answers) values
  ('{"format":"reframe-v1","stage":1,"beforeEmotions":["Uneasy"],"afterEmotions":[],"before":0,"after":null,"text":{"thought":"Private thought"}}');
select is((select (answers->>'before')::int from public.cognitive_reframes), 0, 'draft keeps zero rating');
select throws_ok($$update public.cognitive_reframes set is_current = false, completed_at = now()$$,
  '23514', null, 'completion requires the review stage');
select throws_ok($$update public.cognitive_reframes set answers = jsonb_set(answers,'{after}','101')$$,
  '23514', null, 'ratings above 100 rejected');
update public.cognitive_reframes set is_current = false, completed_at = now(), answers =
  '{"format":"reframe-v1","stage":5,"beforeEmotions":["Uneasy"],"afterEmotions":["Uneasy"],"before":0,"after":0,"text":{"change":"Stayed the same"}}';
select is((select answers->>'format' from public.cognitive_reframes where not is_current), 'reframe-v1', 'completed entry saves without a forced emotional change');
select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'), 1, 'account export includes the entry');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001002';
select is((select count(*) from public.cognitive_reframes), 0::bigint, 'other accounts cannot read entries');
with changed as (update public.cognitive_reframes set answers = '{}' returning id)
select is((select count(*) from changed), 0::bigint, 'other accounts cannot edit entries');
select * from finish();
rollback;
