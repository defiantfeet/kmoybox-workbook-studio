begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000002401','content-editor@example.test'),
  ('00000000-0000-4000-8000-000000002402','content-member@example.test');
insert into public.workbook_editor_accounts values ('00000000-0000-4000-8000-000000002401');
insert into public.growth_content_items(id,kind,module_slug,revision)
values ('00000000-0000-4000-8000-000000002403','prompt','thought-record',1);
insert into public.growth_content_versions(item_id,revision,title,body,category,available,state,effective_at)
values ('00000000-0000-4000-8000-000000002403',1,'Earlier publication','Original text','Learning',true,'published',now()-interval '1 day');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002402';
select is((select count(*) from public.growth_content_items),0::bigint,'member cannot read editorial items');
select is((select count(*) from public.growth_content_current),0::bigint,'member cannot query the editor library');
select is((select count(*) from public.growth_content_versions),0::bigint,'member cannot read editorial history');
select throws_ok($$select public.save_growth_content(null,0,'prompt',null,'Unsafe edit','Copy','',true,'published',null)$$,
  '42501',null,'member cannot write through the RPC');
select throws_ok($$insert into public.growth_content_items(kind) values ('prompt')$$,'42501',null,'member cannot write directly');
select throws_ok($$select * from public.growth_content_engagement()$$,'42501',null,'member cannot retrieve metrics');
select throws_ok($$select * from growth_editor_private.module_visits$$,'42501',null,'member cannot read visit data');
select is((select title from public.published_growth_content()),'Earlier publication','member sees the effective publication');
select public.record_growth_module_visit('thought-record');
select public.record_growth_module_visit('thought-record');
insert into public.growth_exercises(user_id,module_slug,answers)
values ('00000000-0000-4000-8000-000000002402','thought-record','{"0":"Private synthetic thought"}');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002401';
select is((select count(*) from public.growth_exercises),0::bigint,'editor role cannot read another person’s exercise');
select throws_ok($$select * from growth_editor_private.module_visits$$,'42501',null,'editor cannot read visit rows');
select lives_ok($$select public.save_growth_content('00000000-0000-4000-8000-000000002403',1,'prompt','thought-record',
  'Draft text','New draft','Learning',true,'draft',null)$$,'editor can save a draft revision');
select lives_ok($$select public.save_growth_content('00000000-0000-4000-8000-000000002403',2,'prompt','thought-record',
  'Scheduled text','Scheduled version','Learning',true,'published',now()+interval '1 day')$$,'editor can schedule a future revision');
select throws_ok($$select public.save_growth_content('00000000-0000-4000-8000-000000002403',2,'prompt','thought-record',
  'Stale text','Stale version','Learning',true,'draft',null)$$,'40001',null,'stale edits cannot overwrite history');
select is((select count(*) from public.growth_content_versions),3::bigint,'editor sees all revisions');
select is((select title from public.published_growth_content()),'Earlier publication','drafts and future schedules do not replace current content');
reset role;
update public.growth_content_versions set effective_at=now()-interval '1 minute' where revision=3;
insert into auth.users(id,email)
select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid, 'synthetic-content-' || i || '@example.test' from generate_series(2420,2430) i;
insert into growth_editor_private.module_visits
select (date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date,'thought-record',
  ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(2420,2430) i;
insert into growth_editor_private.module_visits
values ((date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date,'emotional-wheel','00000000-0000-4000-8000-000000002402');
select is((select count(*) from growth_editor_private.module_visits where month = date_trunc('month',now() at time zone 'UTC')::date),
  1::bigint,'repeat visits create one monthly record');

set local role authenticated;
select is((select title from public.published_growth_content()),'Scheduled text','scheduled revision takes effect when due');
select is((select member_floor from public.growth_content_engagement()),10::bigint,'closed month counts are bucketed and small groups are suppressed');
select lives_ok($$select public.save_growth_content('00000000-0000-4000-8000-000000002403',3,'prompt','thought-record',
  'Archived text','Archived version','Learning',true,'archived',null)$$,'editor can archive content');
select is((select count(*) from public.published_growth_content()),0::bigint,'archive removes the active publication without restoring earlier versions');

select lives_ok($$select public.save_growth_content(null,0,'availability','emotional-wheel',
  'Emotional Wheel availability','','',false,'published',null)$$,'editor can publish module availability');
select throws_ok($$select public.save_growth_content(null,0,'availability','emotional-wheel',
  'Duplicate availability','','',true,'published',null)$$,'23505',null,'a module has one availability control');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002402';
select is((select available from public.published_growth_content() where module_slug='emotional-wheel'),false,
  'member can only see the published unavailable setting');
select public.record_growth_module_visit('emotional-wheel');
reset role;
select is((select count(*) from growth_editor_private.module_visits where module_slug='emotional-wheel'
  and month=date_trunc('month',now() at time zone 'UTC')::date),0::bigint,'unavailable modules do not collect visits');
select * from finish();
rollback;
