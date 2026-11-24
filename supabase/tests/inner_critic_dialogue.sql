begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000001101', 'dialogue-first@example.test'),
  ('00000000-0000-4000-8000-000000001102', 'dialogue-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001101';
insert into public.inner_critic_entries (answers) values
  ('{"format":"dialogue-v1","themes":["Perfectionism"],"exchanges":[{"id":"00000000-0000-4000-8000-000000001103","message":"Private","trigger":"","learned":"","expectation":"","values":"","purpose":"","response":"I can pause.","action":""}],"emotions":[],"anchors":[]}');
select is((select jsonb_array_length(answers->'exchanges') from public.inner_critic_entries), 1, 'dialogue draft saved');
select throws_ok($$update public.inner_critic_entries set answers = jsonb_set(answers,'{themes}','["Unknown"]')$$,
  '23514', null, 'unknown theme rejected');
update public.inner_critic_entries set is_current = false, completed_at = now();
select is((select count(*) from public.inner_critic_entries where not is_current), 1::bigint, 'dialogue completed');
insert into public.supportive_statements (body) values ('I can pause.');
select is(jsonb_array_length(public.export_personal_activity()->'supportiveStatements'), 1, 'account export includes collection');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001102';
select is((select count(*) from public.inner_critic_entries), 0::bigint, 'dialogue private to owner');
select is((select count(*) from public.supportive_statements), 0::bigint, 'collection private to owner');
with removed as (delete from public.supportive_statements returning id)
select is((select count(*) from removed), 0::bigint, 'other account cannot remove a statement');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001101';
select public.delete_personal_activity();
select is((select count(*) from public.supportive_statements), 0::bigint, 'personal reset removes statements');
select * from finish();
rollback;
