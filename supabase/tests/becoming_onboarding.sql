begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id,email) values ('00000000-0000-4000-8000-000000002101','onboarding-first@example.test'),
  ('00000000-0000-4000-8000-000000002102','onboarding-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002101';
insert into public.notification_preferences(onboarding_status) values('skipped');
select is((select onboarding_status from public.notification_preferences),'skipped','skip persists without requiring answers');
update public.notification_preferences set onboarding_status='saved', growth_onboarding=
  '{"topics":["habits","emotions"],"goals":["Set aside time to draw"],"frequency":"Weekly","times":["08:00"],
  "participation":"Mostly on my own","accessibility":["Written prompts"],"duration":"5 minutes or less","reminders":"No reminders"}';
select is((select growth_onboarding #>> '{times,0}' from public.notification_preferences),'08:00','optional preferences persist');
select throws_ok($$update public.notification_preferences set growth_onboarding=jsonb_set(growth_onboarding,'{times}','["08:00","08:00"]')$$,
  '23514',null,'duplicate times are rejected');
select throws_ok($$update public.notification_preferences set growth_onboarding=growth_onboarding || '{"diagnosis":"unexpected"}'$$,
  '23514',null,'unexpected fields are rejected');
update public.notification_preferences set onboarding_status='skipped';
select is((select growth_onboarding #>> '{goals,0}' from public.notification_preferences),'Set aside time to draw','hiding preserves existing choices');
select is(public.export_personal_activity() #>> '{notificationPreferences,onboarding_status}','skipped','owner export includes onboarding preferences');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002102';
select is((select count(*) from public.notification_preferences),0::bigint,'another member cannot read onboarding preferences');
select * from finish();
rollback;
