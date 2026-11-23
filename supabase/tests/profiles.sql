begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000041','profile-one@example.test','{"display_name":"Learner One"}'),
  ('00000000-0000-4000-8000-000000000042','profile-two@example.test','{"display_name":"Learner Two"}');
insert into public.entitlements (user_id,product_slug) values ('00000000-0000-4000-8000-000000000042','the-boundaries-edit');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000041';
select is((select display_name from public.profiles), 'Learner One', 'signup provisions a private profile');
select is((select count(*) from public.entitlements), 0::bigint, 'another account purchase is hidden');
select lives_ok($$update public.profiles set display_name = 'Denied' where id = '00000000-0000-4000-8000-000000000042'$$,
  'foreign profile update is filtered by RLS');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000042';
select is((select display_name from public.profiles), 'Learner Two', 'another account profile was not modified');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000041';
select lives_ok($$update public.profiles set display_name = 'Renamed learner'$$, 'account can update its own display name');
select is((select display_name from public.profiles), 'Renamed learner', 'profile update was persisted');
select throws_ok($$update public.profiles set id = '00000000-0000-4000-8000-000000000042'$$, '42501', null, 'account cannot change profile ownership');
select throws_ok($$delete from public.profiles$$, '42501', null, 'profile deletion uses account lifecycle');
insert into public.journal_entries (user_id,title,body) values ('00000000-0000-4000-8000-000000000041','Synthetic title','Synthetic reflection');
insert into public.goals (user_id,title) values ('00000000-0000-4000-8000-000000000041','Synthetic goal');
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000041';
select is((select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000041'), 0::bigint, 'auth deletion cascades to profile');
select is((select count(*) from public.journal_entries where user_id = '00000000-0000-4000-8000-000000000041'), 0::bigint, 'auth deletion cascades to journal');
select is((select count(*) from public.goals where user_id = '00000000-0000-4000-8000-000000000041'), 0::bigint, 'auth deletion cascades to goals');
select * from finish();
rollback;
