begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
insert into auth.users (id,email) values ('00000000-0000-4000-8000-000000002001','insight-first@example.test'),
  ('00000000-0000-4000-8000-000000002002','insight-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002001';
insert into public.notification_preferences default values;
select is((select hidden_growth_insights from public.notification_preferences),array['observations'],'descriptive insights are opt-in');
update public.notification_preferences set hidden_growth_insights=array['mood','emotions'];
select is((select hidden_growth_insights from public.notification_preferences),array['mood','emotions'],'individual choices persist');
select throws_ok($$update public.notification_preferences set hidden_growth_insights=array['unsupported']$$,'23514',null,'unknown choices are rejected');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002002';
select is((select count(*) from public.notification_preferences),0::bigint,'preferences are private to their owner');
select * from finish();
rollback;
