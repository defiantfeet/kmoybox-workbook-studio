begin;
-- The synthetic catalog doubles as the legacy authorization fixture.
update public.products set sample = false where sample;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.test');
insert into public.entitlements values ('00000000-0000-4000-8000-000000000001', 'the-boundaries-edit');
insert into public.journal_entries (user_id, title, body) values ('00000000-0000-4000-8000-000000000001', 'Private', 'Private');
insert into public.goals (user_id, title) values ('00000000-0000-4000-8000-000000000001', 'Private');
insert into public.responses (user_id, prompt_id, body) values ('00000000-0000-4000-8000-000000000001', 5, 'Private');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select is((select count(*) from public.journal_entries), 0::bigint, 'other journals hidden');
select is((select count(*) from public.goals), 0::bigint, 'other goals hidden');
select is((select count(*) from public.responses), 0::bigint, 'other workbook answers hidden');
select is((select count(*) from public.entitlements), 0::bigint, 'other purchases hidden');
with changed as (update public.journal_entries set title = 'Changed' returning id)
select is((select count(*) from changed), 0::bigint, 'other journals cannot be updated');
with changed as (update public.goals set title = 'Changed' returning id)
select is((select count(*) from changed), 0::bigint, 'other goals cannot be updated');
with changed as (update public.responses set body = 'Changed' returning prompt_id)
select is((select count(*) from changed), 0::bigint, 'other legacy responses cannot be updated');

select is((select count(*) from public.prompts where id = 5), 0::bigint, 'premium prompt hidden');
select throws_ok($$insert into public.responses values ('00000000-0000-4000-8000-000000000002', 5, 'Blocked', false)$$, '42501', null, 'unentitled users cannot write premium responses');
select throws_ok($$insert into public.entitlements values ('00000000-0000-4000-8000-000000000002', 'the-boundaries-edit')$$, '42501', null, 'users cannot grant themselves purchases');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select is((select count(*) from public.prompts where id = 5), 1::bigint, 'premium prompt granted');
select is((select count(*) from public.journal_entries), 1::bigint, 'own journal visible');
select * from finish();
rollback;
