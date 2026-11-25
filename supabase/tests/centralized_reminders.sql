begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000002301','reminder-first@example.test'),
  ('00000000-0000-4000-8000-000000002302','reminder-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002301';
select public.save_central_reminders('Pacific/Kiritimati',jsonb_build_object(
  'enabled',true,'quietStart',null,'quietEnd',null,'rules',
  (select jsonb_object_agg(kind,jsonb_build_object('enabled',kind='morning','frequency','daily','time','00:00',
      'weekday',1,'monthDay',1,'channel','both'))
   from unnest(array['morning','midday','afternoon','evening','habits','goals','social','weekly','wheel','future','boundary','weeklyReport','monthlyReport']) kind)));
select is((select growth_timezone from public.profiles where id=auth.uid()),'Pacific/Kiritimati','shared timezone is updated');
select is(jsonb_array_length(public.refresh_central_reminders(
  jsonb_build_array(jsonb_build_object('kind','morning','occurrence',public.growth_local_day(auth.uid()))),true,false)->'browser'),
  1,'only one browser delivery is claimed');
select is(jsonb_array_length(public.refresh_central_reminders(
  jsonb_build_array(jsonb_build_object('kind','morning','occurrence',public.growth_local_day(auth.uid()))),true,false)->'browser'),
  0,'a second browser cannot claim the occurrence');
select public.refresh_central_reminders(
  jsonb_build_array(jsonb_build_object('kind','morning','occurrence',public.growth_local_day(auth.uid()) - 1)),false,false);
select is((select count(*) from public.growth_reminder_events),1::bigint,'timezone boundary does not immediately repeat a reminder');
update public.growth_reminder_events set snoozed_until=now()+interval '1 hour',browser_claimed_at=null;
select is(jsonb_array_length(public.refresh_central_reminders('[]',true,false)->'notices'),0,'a snoozed notice stays out of delivery');
update public.growth_reminder_events set snoozed_until=now()-interval '1 second';
select is(jsonb_array_length(public.refresh_central_reminders('[]',true,false)->'browser'),1,'an expired snooze is eligible once again');
update public.notification_preferences set reminders_paused_until=now()+interval '1 hour';
select is(jsonb_array_length(public.refresh_central_reminders('[]',true,true)->'notices'),0,'global pause suspends delivery');
update public.notification_preferences set reminders_paused_until=null, central_reminders=jsonb_set(central_reminders,'{enabled}','false');
select is(jsonb_array_length(public.refresh_central_reminders('[]',true,true)->'notices'),0,'disable all suppresses delivery');
update public.notification_preferences set central_reminders=jsonb_set(central_reminders,'{enabled}','true');
update public.notification_preferences set central_reminders = central_reminders || jsonb_build_object(
  'quietStart', to_char((now() at time zone 'Pacific/Kiritimati') - interval '2 minutes','HH24:MI'),
  'quietEnd', to_char((now() at time zone 'Pacific/Kiritimati') + interval '2 minutes','HH24:MI'));
select is(jsonb_array_length(public.refresh_central_reminders('[]',true,true)->'notices'),0,'local quiet hours suppress delivery');
update public.notification_preferences set central_reminders = central_reminders || '{"quietStart":null,"quietEnd":null}';
insert into public.growth_reminder_events(kind,occurrence,created_at)
  values ('morning',public.growth_local_day(auth.uid()) - 1,now()-interval '24 hours');
update public.growth_reminder_events set dismissed_at=now() where occurrence=public.growth_local_day(auth.uid());
select is(jsonb_array_length(public.refresh_central_reminders('[]',true,true)->'notices'),0,'dismissing the newest reminder does not revive an older occurrence');
select is(jsonb_array_length(public.export_personal_activity()->'reminderEvents'),2,'private export includes reminder metadata');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002302';
select is((select count(*) from public.growth_reminder_events),0::bigint,'another member cannot see delivery state');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002301';
select public.delete_personal_activity();
select is((select count(*) from public.growth_reminder_events),0::bigint,'account activity reset clears delivery state');
select * from finish();
rollback;
