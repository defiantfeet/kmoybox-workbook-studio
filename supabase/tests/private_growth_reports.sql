begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000002201','report-first@example.test'),
  ('00000000-0000-4000-8000-000000002202','report-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002201';
insert into public.growth_reports(id,kind,period_start,period_end,data_through,timezone,categories,reflections,snapshot)
values ('00000000-0000-4000-8000-000000002203','weekly','2026-11-23','2026-11-29','2026-11-24','America/Los_Angeles',
  array['guided','activity'],'{"learning":"My reflection"}','{"activity":{"metrics":[{"label":"Journal entries created","value":1}],"lines":[]}}');
select is((select count(*) from public.growth_reports),1::bigint,'owner can save a weekly report');
select throws_ok($$update public.growth_reports set period_start='2026-11-22'$$,'23514',null,'weekly reports require the correct date boundary');
select throws_ok($$update public.growth_reports set snapshot=snapshot || '{"emotions":{"metrics":[],"lines":[]}}'$$,
  '23514',null,'disabled report categories cannot be saved to the snapshot');
update public.growth_reports set reflections='{"learning":"Revised reflection"}';
select is((select reflections ->> 'learning' from public.growth_reports),'Revised reflection','guided responses can be edited');
select is(public.export_personal_activity() #>> '{growthReports,0,reflections,learning}','Revised reflection','owner export includes the report');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002202';
select is((select count(*) from public.growth_reports),0::bigint,'another owner cannot read the report');
with changed as (update public.growth_reports set reflections='{}' returning id)
select is((select count(*) from changed),0::bigint,'another owner cannot edit the report');
with removed as (delete from public.growth_reports returning id)
select is((select count(*) from removed),0::bigint,'another owner cannot delete the report');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002201';
select public.delete_personal_activity();
select is((select count(*) from public.growth_reports),0::bigint,'personal-data reset deletes reports');
select * from finish();
rollback;
