begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000901', 'emotion-first@example.test'),
  ('00000000-0000-4000-8000-000000000902', 'emotion-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000901';
insert into public.growth_exercises (module_slug, is_current, completed_at, answers)
values ('emotional-wheel', false, now(), '{"format":"emotion-v1","emotions":["Mixed","Steady","Quiet resolve"],"intensity":0,"sensations":"Private","context":"","reflection":""}');
select is((select (answers->>'intensity')::int from public.growth_exercises where module_slug = 'emotional-wheel'), 0, 'zero intensity preserved');
select throws_ok($$update public.growth_exercises set answers = jsonb_set(answers,'{intensity}','101') where module_slug = 'emotional-wheel'$$,
  '23514', null, 'invalid intensity rejected');
select throws_ok($$update public.growth_exercises set answers = jsonb_set(answers,'{emotions}','["Calm","calm"]') where module_slug = 'emotional-wheel'$$,
  '23514', null, 'duplicate labels rejected');
insert into public.growth_check_ins (slot, mood, emotion_labels) values ('daily', 'Mixed', '["Calm","Worried"]');
select is((select jsonb_array_length(emotion_labels) from public.mood_checkins), 2, 'mood can keep multiple labels');
insert into public.growth_exercises (module_slug, answers)
values ('cognitive-reframing', '{"0":"","1":"","2":"","emotions":["Quiet resolve"]}');
select is((select answers->'emotions'->>0 from public.growth_exercises where module_slug = 'cognitive-reframing'), 'Quiet resolve', 'linked exercise can keep custom label');
insert into public.thought_records (answers)
values ('{"format":"thought-v1","stage":2,"date":"","time":"","emotions":["Quiet resolve"],"before":null,"after":null,"text":{}}');
select is((select answers->'emotions'->>0 from public.thought_records), 'Quiet resolve', 'thought records accept the shared vocabulary');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000902';
select is((select count(*) from public.growth_exercises where module_slug = 'emotional-wheel'), 0::bigint, 'other accounts cannot read emotion history');
select is((select count(*) from public.mood_checkins), 0::bigint, 'other accounts cannot read emotion labels from mood check-ins');
select * from finish();
rollback;
