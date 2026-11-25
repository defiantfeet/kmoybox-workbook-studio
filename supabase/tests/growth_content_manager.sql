begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

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
select set_config('test.growth_due_at', (statement_timestamp() + interval '4 seconds')::text, true);
select lives_ok($$select public.save_growth_content('00000000-0000-4000-8000-000000002403',2,'prompt','thought-record',
  'Scheduled text','Scheduled version','Learning',true,'published',current_setting('test.growth_due_at')::timestamptz)$$,'editor can schedule a future revision');
select throws_ok($$select public.save_growth_content('00000000-0000-4000-8000-000000002403',2,'prompt','thought-record',
  'Stale text','Stale version','Learning',true,'draft',null)$$,'40001',null,'stale edits cannot overwrite history');
select is((select count(*) from public.growth_content_versions),3::bigint,'editor sees all revisions');
select is((select title from public.published_growth_content()),'Earlier publication','drafts and future schedules do not replace current content');
select is((select effective_at from public.growth_content_current
  where id='00000000-0000-4000-8000-000000002403'),
  current_setting('test.growth_due_at')::timestamptz,'the editor view returns the exact stored instant');
select set_config('test.growth_cancelled_item',
  public.save_growth_content(null,0,'prompt',null,'Cancelled publication','Cancelled text','',true,'published',
    current_setting('test.growth_due_at')::timestamptz)::text,true);
select lives_ok($$select public.save_growth_content(current_setting('test.growth_cancelled_item')::uuid,1,
  'prompt',null,'Cancelled publication','Draft text','',true,'draft',null)$$,'editor can return scheduled content to draft');
select is((select state from public.growth_content_current
  where id=current_setting('test.growth_cancelled_item')::uuid),'draft','the cancelled item reopens as draft');
select set_config('test.earlier_reflection',
  public.save_growth_content(null,0,'prompt','dashboard-daily-reflection','A previous reflection','Earlier prompt','',true,
    'published',null)::text,true);
select set_config('test.latest_reflection',
  public.save_growth_content(null,0,'prompt','dashboard-daily-reflection','Z latest reflection','Latest prompt','',true,
    'published',current_setting('test.growth_due_at')::timestamptz)::text,true);
select is((select body from public.daily_reflection()),'Earlier prompt','the dashboard keeps the earlier prompt until release');
select throws_ok($$select public.save_growth_content(null,0,'availability','dashboard-daily-reflection','Invalid setting','',
  '',true,'published',null)$$,'23514',null,'only reflection prompts can use the dashboard destination');

reset role;
insert into auth.users(id,email)
select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid, 'synthetic-content-' || i || '@example.test' from generate_series(2420,2430) i;
insert into growth_editor_private.module_visits
select (date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date,'thought-record',
  ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(2420,2430) i;
insert into growth_editor_private.module_visits
values ((date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date,'emotional-wheel','00000000-0000-4000-8000-000000002402');
select is((select count(*) from growth_editor_private.module_visits where month = date_trunc('month',now() at time zone 'UTC')::date),
  1::bigint,'repeat visits create one monthly record');

select pg_sleep(greatest(0, extract(epoch from current_setting('test.growth_due_at')::timestamptz - clock_timestamp())));
set local role authenticated;
select is((select title from public.published_growth_content()),'Scheduled text','scheduled revision takes effect when due');
select is((select body from public.daily_reflection()),'Latest prompt','the most recently effective dashboard reflection wins');
select is((select body from public.daily_reflection(current_setting('test.earlier_reflection')::uuid,1)),'Earlier prompt',
  'a journal link keeps the available prompt shown on the dashboard');
select public.save_growth_content(current_setting('test.earlier_reflection')::uuid,1,'prompt','dashboard-daily-reflection',
  'A previous reflection','Updated prompt','',true,'published',null);
select is((select body from public.daily_reflection(current_setting('test.earlier_reflection')::uuid,1)),'Earlier prompt',
  'a journal link keeps the shown prompt across an update to the same item');
select public.save_growth_content(current_setting('test.earlier_reflection')::uuid,2,'prompt','dashboard-daily-reflection',
  'A previous reflection','Updated prompt','',true,'archived',null);
select is((select body from public.daily_reflection(current_setting('test.earlier_reflection')::uuid,1)),'Latest prompt',
  'a journal link switches to the current prompt when its item is archived');
select is((select count(*) from public.published_growth_content() where module_slug='dashboard-daily-reflection'),0::bigint,
  'dashboard prompts stay out of Personal Growth resources');
select throws_ok($$select * from growth_editor_private.effective_publications$$,'42501',null,
  'authenticated clients cannot query the private publication view directly');

select is((select count(*) from public.published_growth_content() where title='Scheduled text'),1::bigint,
  'repeated reads return one publication after the scheduled time');
select is((select count(*) from public.growth_content_versions
  where item_id='00000000-0000-4000-8000-000000002403'),3::bigint,'publication creates no additional revision');
select is((select count(*) from public.published_growth_content()
  where item_id=current_setting('test.growth_cancelled_item')::uuid),0::bigint,'the cancelled revision stays unpublished after its due time');
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
