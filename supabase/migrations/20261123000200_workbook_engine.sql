create table public.workbook_editor_accounts (
  user_id uuid primary key references auth.users on delete cascade
);
create table public.engine_workbooks (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 64),
  title text not null,
  summary text not null,
  sample boolean not null default false
);
create table public.engine_module_drafts (
  id uuid primary key default gen_random_uuid(),
  workbook_slug text not null references public.engine_workbooks on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  edit_version integer not null default 1 check (edit_version > 0)
);
create table public.engine_modules (
  id uuid primary key references public.engine_module_drafts on delete cascade,
  workbook_slug text not null references public.engine_workbooks on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  revision integer not null check (revision > 0)
);
create table public.engine_progress (
  user_id uuid not null references auth.users on delete cascade,
  module_id uuid not null references public.engine_modules on delete cascade,
  revision integer not null check (revision > 0),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 180000),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);
create index on public.engine_modules (workbook_slug);
create index on public.engine_module_drafts (workbook_slug);

alter table public.workbook_editor_accounts enable row level security;
alter table public.engine_workbooks enable row level security;
alter table public.engine_module_drafts enable row level security;
alter table public.engine_modules enable row level security;
alter table public.engine_progress enable row level security;

revoke all on public.workbook_editor_accounts, public.engine_workbooks, public.engine_module_drafts, public.engine_modules, public.engine_progress from public, anon, authenticated;
grant select on public.workbook_editor_accounts, public.engine_workbooks, public.engine_module_drafts, public.engine_modules, public.engine_progress to authenticated;
grant insert on public.engine_workbooks to authenticated;
grant insert, update on public.engine_module_drafts to authenticated;
grant insert, update on public.engine_progress to authenticated;

create policy editors_read_self on public.workbook_editor_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy engine_workbooks_read on public.engine_workbooks for select to authenticated
  using (exists (select 1 from public.engine_modules where workbook_slug = slug)
    or exists (select 1 from public.workbook_editor_accounts));
create policy engine_workbooks_create on public.engine_workbooks for insert to authenticated
  with check (exists (select 1 from public.workbook_editor_accounts) and not sample
    and not exists (select 1 from public.products where products.slug = engine_workbooks.slug));
create policy engine_module_drafts_editor on public.engine_module_drafts for all to authenticated
  using (exists (select 1 from public.workbook_editor_accounts))
  with check (exists (select 1 from public.workbook_editor_accounts));
create policy engine_modules_read on public.engine_modules for select to authenticated using (true);
create policy engine_progress_read on public.engine_progress for select to authenticated
  using (user_id = (select auth.uid()));
create policy engine_progress_create on public.engine_progress for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy engine_progress_update on public.engine_progress for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function public.publish_workbook_module(draft_id uuid, expected_version integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare draft public.engine_module_drafts%rowtype;
begin
  if not exists (select 1 from public.workbook_editor_accounts where user_id = (select auth.uid())) then
    raise exception 'Workbook editor access required' using errcode = '42501';
  end if;
  select * into draft from public.engine_module_drafts where id = draft_id for update;
  if not found or draft.edit_version <> expected_version then return false; end if;
  insert into public.engine_modules (id, workbook_slug, content, revision)
  values (draft.id, draft.workbook_slug, draft.content, draft.edit_version)
  on conflict (id) do update set content = excluded.content, revision = excluded.revision;
  return true;
end;
$$;

revoke all on function public.publish_workbook_module(uuid, integer) from public, anon, authenticated;
grant execute on function public.publish_workbook_module(uuid, integer) to authenticated;

create function public.check_workbook_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  published public.engine_modules%rowtype;
  block jsonb;
  answer jsonb;
begin
  select * into published from public.engine_modules where id = new.module_id for share;
  if not found or published.revision <> new.revision then
    raise exception 'Workbook module has changed' using errcode = '23514';
  end if;
  if new.completed then
    for block in select value from jsonb_array_elements(published.content->'blocks') loop
      answer := new.answers -> (block->>'id');
      if not coalesce(case block->>'kind'
        when 'lesson' then true
        when 'reflection' then jsonb_typeof(answer) = 'string' and length(btrim(answer #>> '{}')) between 1 and 2000
        when 'choice' then jsonb_typeof(answer) = 'string' and exists (
          select 1 from jsonb_array_elements(block->'options') option where option->>'id' = (answer #>> '{}'))
        when 'rating' then jsonb_typeof(answer) = 'string' and exists (
          select 1 from generate_series(1, (block->>'max')::integer) rating where rating::text = (answer #>> '{}'))
        when 'goal' then jsonb_typeof(answer) = 'object'
          and jsonb_typeof(answer->'goal') = 'string' and length(btrim(answer->>'goal')) between 1 and 500
          and jsonb_typeof(answer->'step') = 'string' and length(btrim(answer->>'step')) between 1 and 500
        else false end, false) then
        raise exception 'Every exercise needs a valid answer' using errcode = '23514';
      end if;
    end loop;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.check_workbook_progress() from public, anon, authenticated;
create trigger check_workbook_progress before insert or update on public.engine_progress
for each row execute function public.check_workbook_progress();
