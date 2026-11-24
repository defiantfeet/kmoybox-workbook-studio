begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000001401','social-first@example.test'),
  ('00000000-0000-4000-8000-000000001402','social-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001401';

insert into public.growth_exercises (user_id,module_slug,answers,is_current)
values (auth.uid(),'social-integration','{"format":"social-v1","kind":"awareness","key":"","fields":{"0":"Private"}}',false);
select throws_ok($$insert into public.growth_exercises (user_id,module_slug,answers,is_current)
  values (auth.uid(),'social-integration','{"format":"social-v1","kind":"awareness","key":"","fields":{"0":"Duplicate"}}',false)$$,
  '23505', null, 'a second singleton cannot overwrite the first reflection');
select throws_ok($$update public.growth_exercises set answers = '{"format":"social-v1","kind":"weekly","key":"2026-11-24","fields":{"0":"Tuesday"}}'$$,
  '23514', null, 'weekly reflections use a Monday key');
select throws_ok($$insert into public.social_interactions (local_date,details) values ('2026-11-24','{"1":"No activity"}')$$,
  '23514', null, 'structured interactions require an activity');
insert into public.social_interactions (local_date,details) values ('2026-11-24','{"0":"Private interaction","3":"At ease"}');

select ok(public.save_social_goal(null,null,'Private goal',null,'Active','') is not null, 'social goal is linked atomically');
select ok(public.save_social_goal((select id from public.social_goals),(select updated_at from public.social_goals),
  'Revised private goal',null,'Postponed','Adjust to my capacity') is not null, 'owner can postpone and edit a goal');
select is((select status from public.social_goals),'Postponed', 'postponement persists');
select is(jsonb_array_length(public.export_personal_activity()->'socialInteractions'),1,'personal-data export includes the journal');

select set_config('test.social_goal_id', (select id::text from public.social_goals), true);
select set_config('test.social_goal_revision', (select updated_at::text from public.social_goals), true);
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001402';
select is((select count(*) from public.growth_exercises where module_slug='social-integration'),0::bigint,'other users cannot read reflections');
select is((select count(*) from public.social_goals),0::bigint,'other users cannot read social goals');
select is((select count(*) from public.social_interactions),0::bigint,'other users cannot read the journal');
select throws_ok($$select public.save_social_goal(current_setting('test.social_goal_id')::uuid, current_setting('test.social_goal_revision')::timestamptz,'Forged',null,'Active','')$$,
  '40001', null, 'goal RPC rejects a record outside the owner scope');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001401';
select public.delete_personal_activity();
select is((select count(*) from public.social_interactions),0::bigint,'personal-data reset removes journal entries');
select * from finish();
rollback;
