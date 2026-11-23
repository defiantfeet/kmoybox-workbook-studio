alter table public.journal_entries drop constraint journal_entries_title_check, drop constraint journal_entries_body_check,
  add constraint journal_entry_content check (char_length(title) <= 140 and char_length(body) <= 10000 and (length(btrim(title)) > 0 or length(btrim(body)) > 0));

alter table public.journal_entries
  add column mood text check (mood in ('calm','energized','hopeful','tired','unsettled','mixed')),
  add column workbook_ref text check (length(workbook_ref) <= 100),
  add column updated_at timestamptz not null default now();
alter table public.goals
  add column workbook_ref text check (length(workbook_ref) <= 100),
  add column created_at timestamptz not null default now(),
  add constraint goals_id_owner unique (id, user_id);

create table public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  user_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 140),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);
create table public.goal_activity (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('goal-created','goal-completed','goal-reopened','milestone-added','milestone-completed','milestone-reopened','milestone-removed')),
  title text not null,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);
create index on public.goal_milestones (user_id, goal_id);
create index on public.goal_activity (user_id, created_at desc);

alter table public.goal_milestones enable row level security;
alter table public.goal_activity enable row level security;
revoke all on public.goal_milestones, public.goal_activity from public, anon, authenticated;
grant select, insert, update, delete on public.goal_milestones to authenticated;
grant select on public.goal_activity to authenticated;
create policy milestone_owner on public.goal_milestones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy activity_owner on public.goal_activity for select to authenticated using (user_id = (select auth.uid()));

create function public.log_goal_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_kind text;
begin
  if tg_table_name = 'goals' then
    if tg_op = 'INSERT' then event_kind := 'goal-created';
    elsif new.completed is distinct from old.completed then
      event_kind := case when new.completed then 'goal-completed' else 'goal-reopened' end;
    end if;
    if event_kind is not null then
      insert into public.goal_activity (goal_id,user_id,kind,title) values (new.id,new.user_id,event_kind,new.title);
    end if;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.goals where id = old.goal_id) then
      insert into public.goal_activity (goal_id,user_id,kind,title) values (old.goal_id,old.user_id,'milestone-removed',old.title);
    end if;
  else
    if tg_op = 'INSERT' then event_kind := 'milestone-added';
    elsif new.completed is distinct from old.completed then
      event_kind := case when new.completed then 'milestone-completed' else 'milestone-reopened' end;
    end if;
    if event_kind is not null then
      insert into public.goal_activity (goal_id,user_id,kind,title) values (new.goal_id,new.user_id,event_kind,new.title);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.log_goal_activity() from public, anon, authenticated;
create trigger goal_history after insert or update on public.goals for each row execute function public.log_goal_activity();
create trigger milestone_history after insert or update or delete on public.goal_milestones for each row execute function public.log_goal_activity();

create function public.check_personal_workbook_link()
returns trigger language plpgsql set search_path = '' as $$
declare ref text := new.workbook_ref;
declare is_journal boolean := tg_table_name = 'journal_entries';
begin
  if ref is null then return new; end if;
  if tg_op = 'UPDATE' and ref is not distinct from old.workbook_ref then return new; end if;
  if ref ~ '^legacy:[1-9][0-9]{0,8}$' and exists (
    select 1 from public.prompts where id::text = split_part(ref, ':', 2)
      and (not is_journal or exists (select 1 from public.responses r where r.prompt_id = prompts.id and r.user_id = new.user_id))
  ) then return new; end if;
  if ref ~ '^engine:[0-9a-f-]{36}:[0-9a-f-]{36}$' and exists (
    select 1 from public.engine_modules m cross join lateral jsonb_array_elements(m.content->'blocks') b
    where m.id::text = split_part(ref, ':', 2) and b->>'id' = split_part(ref, ':', 3) and b->>'kind' <> 'lesson'
      and (not is_journal or exists (select 1 from public.engine_progress p
        where p.module_id = m.id and p.user_id = new.user_id and p.answers ? (b->>'id')))
  ) then return new; end if;
  raise exception 'Workbook connection unavailable' using errcode = '23514';
end;
$$;
create trigger journal_workbook_link before insert or update on public.journal_entries for each row execute function public.check_personal_workbook_link();
create trigger goal_workbook_link before insert or update on public.goals for each row execute function public.check_personal_workbook_link();

create function public.delete_personal_activity()
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  delete from public.journal_entries where user_id = owner_id;
  delete from public.goals where user_id = owner_id;
  delete from public.responses where user_id = owner_id;
  delete from public.engine_progress where user_id = owner_id;
end;
$$;
grant delete on public.engine_progress to authenticated;
create policy engine_progress_delete on public.engine_progress for delete to authenticated using (user_id = (select auth.uid()));
revoke all on function public.delete_personal_activity() from public, anon, authenticated;
grant execute on function public.delete_personal_activity() to authenticated;

create function public.export_personal_activity()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'journalEntries', coalesce((select jsonb_agg(to_jsonb(j) - 'user_id' order by created_at) from public.journal_entries j where j.user_id = (select auth.uid())), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by created_at) from public.goals g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'milestones', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by created_at) from public.goal_milestones m where m.user_id = (select auth.uid())), '[]'::jsonb),
    'goalHistory', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id' order by created_at) from public.goal_activity h where h.user_id = (select auth.uid())), '[]'::jsonb),
    'workbookResponses', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by prompt_id) from public.responses r where r.user_id = (select auth.uid())), '[]'::jsonb),
    'moduleResponses', coalesce((select jsonb_agg(to_jsonb(p) - 'user_id' order by updated_at) from public.engine_progress p where p.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;
revoke all on function public.export_personal_activity() from public, anon, authenticated;
grant execute on function public.export_personal_activity() to authenticated;
