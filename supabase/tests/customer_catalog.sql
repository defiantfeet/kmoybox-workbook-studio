begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000091', 'customer@example.test', '{"role":"admin","workbook_editor":true}');
insert into public.entitlements (user_id, product_slug) values
  ('00000000-0000-4000-8000-000000000091', 'the-boundaries-edit');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000091';

select is((select count(*) from public.products where slug = 'finding-my-voice'), 0::bigint, 'sample catalog hidden');
select is((select count(*) from public.prompts where product_slug = 'the-boundaries-edit'), 0::bigint, 'legacy sample prompts hidden even with entitlement');
select is((select count(*) from public.workbook_storefront() where slug = 'the-dancer-mindset'), 0::bigint, 'sample storefront item hidden');
select is(public.engine_can_read_workbook('the-dancer-mindset'), false, 'sample workbook cannot be opened');
select is((select count(*) from public.engine_modules where workbook_slug = 'the-dancer-mindset'), 0::bigint, 'sample modules protected by RLS');
select is((select count(*) from public.workbook_editor_accounts), 0::bigint, 'self-supplied signup metadata grants no editor role');
select throws_ok($$insert into public.workbook_editor_accounts values ('00000000-0000-4000-8000-000000000091')$$, '42501', null, 'customers cannot grant editor privileges');
select throws_ok($$insert into public.engine_workbooks (slug,title,summary) values ('unauthorized','Unauthorized','Unauthorized')$$, '42501', null, 'customers cannot create workbook content');
select * from finish();
rollback;
