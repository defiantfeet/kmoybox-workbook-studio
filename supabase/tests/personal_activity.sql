begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000031', 'writer-one@example.test'),
  ('00000000-0000-4000-8000-000000000032', 'writer-two@example.test');
insert into public.entitlements (user_id, product_slug) values ('00000000-0000-4000-8000-000000000031','the-boundaries-edit');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000031';
insert into public.responses (user_id,prompt_id,body) values ('00000000-0000-4000-8000-000000000031',1,'A saved answer');
insert into public.journal_entries (user_id,title,body,mood,workbook_ref)
values ('00000000-0000-4000-8000-000000000031','','A private reflection','calm','legacy:1');
insert into public.goals (id,user_id,title,workbook_ref)
values ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000031','My goal','legacy:2');
insert into public.goal_milestones (id,goal_id,user_id,title)
values ('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000031','My milestone');
update public.goal_milestones set completed = true where id = '70000000-0000-4000-8000-000000000002';
select is((select count(*) from public.goal_activity), 3::bigint, 'goal and milestone history is generated from mutations');
select is(jsonb_array_length(public.export_personal_activity()->'journalEntries')::bigint, 1::bigint, 'export contains saved journal activity');
select is(jsonb_array_length(public.export_personal_activity()->'milestones')::bigint, 1::bigint, 'export includes milestones');
insert into public.engine_progress (user_id,module_id,revision,answers)
values ('00000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000001',1,
  '{"20000000-0000-4000-8000-000000000002":"A saved response"}');
select lives_ok($$update public.journal_entries
set workbook_ref = 'engine:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000002'$$,
  'journal can attach an owned engine response');
select throws_ok($$update public.journal_entries
set workbook_ref = 'engine:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'an unanswered engine exercise cannot be attached to a journal');


set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000032';
select is((select count(*) from public.journal_entries), 0::bigint, 'other journals are hidden');
select is((select count(*) from public.goal_milestones), 0::bigint, 'other milestones are hidden');
select is((select count(*) from public.goal_activity), 0::bigint, 'other history is hidden');
select throws_ok($$insert into public.journal_entries (user_id,title,body,workbook_ref)
values ('00000000-0000-4000-8000-000000000032', 'Mine', '', 'legacy:1')$$, '23514', null, 'another users response cannot be attached');
select throws_ok($$insert into public.goal_milestones (goal_id,user_id,title)
values ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000032','Not my goal')$$, '23503', null, 'another users goal cannot be changed');
select public.delete_personal_activity();
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000031';
select is((select count(*) from public.journal_entries), 1::bigint, 'deleting another account activity leaves own entries untouched');
select public.delete_personal_activity();
select is((select count(*) from public.goal_activity), 0::bigint, 'deletion removes milestone and goal history');
select is((select count(*) from public.entitlements), 1::bigint, 'deletion preserves purchases');
select * from finish();
rollback;
