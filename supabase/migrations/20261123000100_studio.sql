create table public.products (
  slug text primary key,
  title text not null,
  summary text not null,
  free boolean not null default false
);
create table public.prompts (
  id integer primary key,
  product_slug text not null references public.products on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  question text not null,
  unique (product_slug, position)
);
create table public.entitlements (
  user_id uuid not null references auth.users on delete cascade,
  product_slug text not null references public.products on delete cascade,
  primary key (user_id, product_slug)
);
create table public.responses (
  user_id uuid not null references auth.users on delete cascade,
  prompt_id integer not null references public.prompts on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  completed boolean not null default false,
  primary key (user_id, prompt_id)
);
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  target_date date,
  completed boolean not null default false
);
create index on public.journal_entries (user_id, created_at desc);
create index on public.goals (user_id);

alter table public.products enable row level security;
alter table public.prompts enable row level security;
alter table public.entitlements enable row level security;
alter table public.responses enable row level security;
alter table public.journal_entries enable row level security;
alter table public.goals enable row level security;

revoke all on public.products, public.prompts, public.entitlements, public.responses, public.journal_entries, public.goals from anon, authenticated;
grant select on public.products, public.prompts, public.entitlements to authenticated;
grant select, insert, update, delete on public.responses, public.journal_entries, public.goals to authenticated;
create policy catalog_read on public.products for select to authenticated using (true);
create policy entitlements_read on public.entitlements for select to authenticated using (user_id = (select auth.uid()));
create policy prompts_read on public.prompts for select to authenticated using (
  exists (select 1 from public.products where slug = product_slug and free)
  or exists (select 1 from public.entitlements e where e.product_slug = prompts.product_slug and e.user_id = (select auth.uid()))
);
create policy responses_owner on public.responses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.prompts where id = prompt_id));
create policy journal_owner on public.journal_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goals_owner on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
