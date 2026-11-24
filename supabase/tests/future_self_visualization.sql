begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000001601','future-first@example.test'),
  ('00000000-0000-4000-8000-000000001602','future-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001601';

insert into public.future_self_entries (is_current,completed_at,answers)
values (false,now(),'{"format":"future-v1","origin":"2024-02-29","target":"2025-02-28","horizon":"1 year",
  "customDate":"","reflectionDate":"2025-01-01","sections":{"community":"Private"},"prompts":{},
  "letter":"Private letter","board":["Private card"]}');
select is((select answers->>'target' from public.future_self_entries),'2025-02-28','calendar horizon clamps a leap day');
select throws_ok($$update public.future_self_entries set answers=jsonb_set(answers,'{target}','"2025-03-01"')$$,
  '23514', null, 'inconsistent target dates are rejected');
select throws_ok($$update public.future_self_entries set answers=jsonb_set(answers,'{reflectionDate}','"2024-02-28"')$$,
  '23514', null, 'review date cannot precede the origin');
update public.future_self_entries set answers=jsonb_set(answers,'{letter}','"Revised letter"');
select is((select answers->>'letter' from public.future_self_entries),'Revised letter','the letter remains editable');

select ok(public.create_future_self_goal('Make time to draw',null,array['Set out supplies','Choose a time']) is not null,'goal and milestones are created together');
select throws_ok($$select public.create_future_self_goal('Invalid plan',null,array['Valid',''])$$,
  '23514', null, 'invalid milestone rejects the entire plan');
select is((select count(*) from public.goals),1::bigint,'invalid plan created no goal');
select is((select count(*) from public.goal_milestones),2::bigint,'both milestones were stored with the goal');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001602';
select is((select count(*) from public.future_self_entries),0::bigint,'other members cannot access reflections or vision boards');
select is((select count(*) from public.goal_milestones),0::bigint,'other members cannot access milestones');
select * from finish();
rollback;
