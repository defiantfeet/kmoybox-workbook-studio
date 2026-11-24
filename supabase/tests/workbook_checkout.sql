begin;
update public.engine_workbooks set sample = false where slug = 'the-dancer-mindset';
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000051','payer@example.test'),
  ('00000000-0000-4000-8000-000000000052','other@example.test');
update public.engine_workbooks set requires_purchase = true where slug = 'the-dancer-mindset';
insert into public.workbook_prices values ('the-dancer-mindset','price_synthetic',1200,'usd',true);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000051';
select is((select amount from public.workbook_storefront() where slug = 'the-dancer-mindset'), 1200, 'locked workbook price is visible');
select is((select count(*) from public.engine_modules where workbook_slug = 'the-dancer-mindset'), 0::bigint, 'unpaid module content is hidden');
select throws_ok($$insert into public.engine_progress (user_id,module_id,revision,answers)
values ('00000000-0000-4000-8000-000000000051','10000000-0000-4000-8000-000000000001',1,'{}')$$,
'42501',null,'unpaid module responses cannot be created');
select throws_ok($$select public.reserve_workbook_checkout('00000000-0000-4000-8000-000000000051','the-dancer-mindset')$$,
'42501',null,'a browser role cannot reserve purchases directly');
select throws_ok($$update public.workbook_purchases set status = 'paid'$$,'42501',null,'a buyer cannot self-unlock');
reset role;

create temporary table purchase_test as select public.reserve_workbook_checkout(
'00000000-0000-4000-8000-000000000051','the-dancer-mindset') order_row;
grant select on purchase_test to authenticated;
select is((select order_row->>'status' from purchase_test),'pending','reservation starts pending');
select is(public.reserve_workbook_checkout('00000000-0000-4000-8000-000000000051','the-dancer-mindset')->>'id',
(select order_row->>'id' from purchase_test),'repeat checkout reuses pending purchase');
select is(public.bind_workbook_checkout((select (order_row->>'id')::uuid from purchase_test),'cs_test_first'),true,'test session binds once');
select is(public.bind_workbook_checkout((select (order_row->>'id')::uuid from purchase_test),'cs_test_other'),false,'a different session cannot replace the binding');
select is(public.record_workbook_payment('evt_price_mismatch',(select (order_row->>'id')::uuid from purchase_test),'cs_test_first','pi_test_first','paid',100,'usd',0),
'mismatch','incorrect amount does not grant access');

set local role authenticated;
select is((select count(*) from public.engine_modules where workbook_slug = 'the-dancer-mindset'),0::bigint,'a pending purchase still cannot read modules');
reset role;
select is(public.record_workbook_payment('evt_payment',(select (order_row->>'id')::uuid from purchase_test),'cs_test_first','pi_test_first','paid',1200,'usd',0),
'recorded','verified full payment is recorded');
select is(public.record_workbook_payment('evt_payment',(select (order_row->>'id')::uuid from purchase_test),'cs_test_first','pi_test_first','paid',1200,'usd',0),
'duplicate','redelivery is idempotent');
set local role authenticated;
select is((select count(*) from public.engine_modules where workbook_slug = 'the-dancer-mindset'),3::bigint,'payment unlocks modules for the buyer');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000052';
select is((select count(*) from public.workbook_purchases),0::bigint,'another learner cannot see purchase history');
select is((select count(*) from public.engine_modules where workbook_slug = 'the-dancer-mindset'),0::bigint,'another learner stays locked');
reset role;

select public.record_workbook_payment('evt_partial',(select (order_row->>'id')::uuid from purchase_test),null,'pi_test_first','refund',1200,'usd',200);
select is((select status from public.workbook_purchases),'paid','partial refunds retain access');
select public.record_workbook_payment('evt_full',(select (order_row->>'id')::uuid from purchase_test),null,'pi_test_first','refund',1200,'usd',1200);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000051';
select is((select count(*) from public.engine_modules where workbook_slug = 'the-dancer-mindset'),0::bigint,'full refunds revoke module access');
reset role;
select public.record_workbook_payment('evt_late',(select (order_row->>'id')::uuid from purchase_test),'cs_test_first','pi_test_first','paid',1200,'usd',0);
select is((select status from public.workbook_purchases),'refunded','late payment events cannot re-unlock a refunded purchase');
update public.workbook_purchases set status = 'revoked';
select is(public.reserve_workbook_checkout('00000000-0000-4000-8000-000000000051','the-dancer-mindset'),null::jsonb,'manual revocation prevents repurchase');
create temporary table other_purchase as select public.reserve_workbook_checkout(
'00000000-0000-4000-8000-000000000052','the-dancer-mindset') order_row;
select is(public.record_workbook_payment('evt_first_refund',(select (order_row->>'id')::uuid from other_purchase),null,'pi_test_second','refund',1200,'usd',1200),
'recorded','full refund can arrive before the checkout webhook');
select public.record_workbook_payment('evt_second_late',(select (order_row->>'id')::uuid from other_purchase),'cs_test_second','pi_test_second','paid',1200,'usd',0);
select is((select status from public.workbook_purchases where user_id='00000000-0000-4000-8000-000000000052'),'refunded','out-of-order checkout cannot unlock a refunded purchase');
select * from finish();
rollback;
