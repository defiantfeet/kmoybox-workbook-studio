begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000001501','body-first@example.test'),
  ('00000000-0000-4000-8000-000000001502','body-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001501';
insert into public.body_awareness_entries (is_current, completed_at, answers)
values (false, now(), '{"format":"body-v1","observations":[{"region":"Jaw","sensation":"Custom","custom":"Flutter","intensity":0,"emotions":["Calm"],"context":"","activity":"","reflection":""}],"movement":{"activity":"","before":"","after":""}}');
select is((select answers #>> '{observations,0,intensity}' from public.body_awareness_entries),'0','a zero rating survives persistence');
select throws_ok($$update public.body_awareness_entries set answers=jsonb_set(answers,'{observations,0,intensity}','11')$$,
  '23514', null, 'out of range intensity is rejected');
select throws_ok($$update public.body_awareness_entries set answers=jsonb_set(answers,'{observations}',
  (answers->'observations') || (answers->'observations'))$$, '23514', null, 'duplicate regions are rejected');
select throws_ok($$update public.body_awareness_entries set answers=jsonb_set(answers,'{observations,0,custom}','""')$$,
  '23514', null, 'custom sensations require a label');
insert into public.body_awareness_entries (is_current, completed_at, answers)
values (false, now(), '{"format":"body-v1","observations":[],"movement":{"activity":"Stillness","before":"","after":"I heard birds."}}');
select is((select count(*) from public.body_awareness_entries),2::bigint,'the movement reflection can be saved without using the map');
select is(jsonb_array_length(public.export_personal_activity()->'growthExercises'),2,'personal-data export includes both observations');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001502';
select is((select count(*) from public.body_awareness_entries),0::bigint,'other users cannot see body observations');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001501';
select public.delete_personal_activity();
select is((select count(*) from public.body_awareness_entries),0::bigint,'personal-data reset removes body observations');
select * from finish();
rollback;
