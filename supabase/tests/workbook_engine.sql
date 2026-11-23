begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000011', 'editor@example.test'),
  ('00000000-0000-4000-8000-000000000012', 'learner@example.test');
insert into public.workbook_editor_accounts values ('00000000-0000-4000-8000-000000000011');
insert into public.engine_workbooks (slug, title, summary) values ('draft-only', 'Draft only', 'Private till published');
insert into public.engine_module_drafts (id, workbook_slug, content) values (
  '40000000-0000-4000-8000-000000000001', 'draft-only',
  '{"format":1,"title":"A lesson","chapter":"Start","chapterOrder":1,"order":1,"blocks":[{"id":"50000000-0000-4000-8000-000000000001","kind":"lesson","body":"Take a breath."}]}'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000012';
select is((select count(*) from public.engine_workbooks where slug = 'draft-only'), 0::bigint, 'unpublished workbooks are hidden');
select is((select count(*) from public.engine_module_drafts), 0::bigint, 'drafts are hidden from learners');
select throws_ok($$select public.publish_workbook_module('40000000-0000-4000-8000-000000000001', 1)$$, '42501', null, 'learners cannot publish');
select throws_ok($$insert into public.engine_progress (user_id, module_id, revision, answers, completed)
  values ('00000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 1, '{}', true)$$,
  '23514', null, 'module completion requires all answers');
select throws_ok($$insert into public.engine_progress (user_id, module_id, revision, answers)
  values ('00000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 9, '{}')$$,
  '23514', null, 'stale or unknown revisions cannot save');
select lives_ok($$insert into public.engine_progress (user_id, module_id, revision, answers, completed)
  values ('00000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 1,
  '{"20000000-0000-4000-8000-000000000002":"I noticed my breath.","20000000-0000-4000-8000-000000000003":"30000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000004":"4"}', true)$$,
  'a learner can complete a module with valid answers');
select is((select count(*) from public.engine_progress), 1::bigint, 'learner can see own progress');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000011';
select is((select count(*) from public.engine_progress), 0::bigint, 'editors cannot see learner answers');
select is(public.publish_workbook_module('40000000-0000-4000-8000-000000000001', 2), false, 'stale publication is rejected');
select is(public.publish_workbook_module('40000000-0000-4000-8000-000000000001', 1), true, 'editor can publish a saved module');
update public.engine_module_drafts set content = jsonb_set(content, '{title}', '"Changed draft"'), edit_version = 2
where id = '40000000-0000-4000-8000-000000000001';

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000012';
select is((select count(*) from public.engine_workbooks where slug = 'draft-only'), 1::bigint, 'published workbook appears for learners');
select is((select content->>'title' from public.engine_modules where id = '40000000-0000-4000-8000-000000000001'),
  'A lesson', 'draft edits leave the published module intact');

select * from finish();
rollback;
