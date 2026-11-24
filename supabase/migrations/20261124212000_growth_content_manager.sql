create schema if not exists growth_editor_private;
revoke all on schema growth_editor_private from public, anon, authenticated;
grant usage on schema growth_editor_private to authenticated;

create table public.growth_content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('prompt','emotion','value','habit','scenario','participation','boundary','education','body','future','weekly','availability','category','exercise')),
  module_slug text check (module_slug in ('identity-mapping','values-assessment','life-timeline','thought-record','emotional-wheel','cognitive-reframing','inner-critic-dialogue','mood-tracker','relationship-inventory','social-integration','boundary-builder','body-awareness-map','wheel-of-life','future-self-visualization','habit-tracker')),
  revision integer not null default 0,
  check (kind <> 'availability' or module_slug is not null)
);
create unique index growth_content_one_availability on public.growth_content_items(module_slug) where kind = 'availability';
create table public.growth_content_versions (
  item_id uuid not null references public.growth_content_items on delete cascade,
  revision integer not null check (revision > 0),
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null check (length(body) <= 8000),
  category text not null check (length(category) <= 120),
  available boolean not null,
  state text not null check (state in ('draft','published','archived')),
  effective_at timestamptz,
  saved_at timestamptz not null default now(),
  primary key(item_id, revision),
  check ((state = 'draft') = (effective_at is null))
);
create index growth_content_effective_revision on public.growth_content_versions(item_id, revision desc) where state <> 'draft';

alter table public.growth_content_items enable row level security;
alter table public.growth_content_versions enable row level security;
revoke all on public.growth_content_items, public.growth_content_versions from public, anon, authenticated;
grant select on public.growth_content_items, public.growth_content_versions to authenticated;
create policy growth_content_editor_items on public.growth_content_items for select to authenticated
  using (exists (select 1 from public.workbook_editor_accounts));
create policy growth_content_editor_versions on public.growth_content_versions for select to authenticated
  using (exists (select 1 from public.workbook_editor_accounts));

create table growth_editor_private.module_visits (
  month date not null,
  module_slug text not null,
  member_id uuid not null references auth.users on delete cascade,
  primary key (month, module_slug, member_id)
);
alter table growth_editor_private.module_visits enable row level security;

create function growth_editor_private.save_content(item uuid, expected integer, content_kind text, target text,
  heading text, copy text, category_name text, enabled boolean, stage text, scheduled timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  next_revision integer;
  stamp timestamptz := statement_timestamp();
begin
  if (select auth.uid()) is null or not exists
    (select 1 from public.workbook_editor_accounts where user_id = (select auth.uid())) then
    raise exception 'Editor access required' using errcode = '42501';
  end if;
  if stage not in ('draft','published','archived') or (item is null and (expected <> 0 or stage = 'archived'))
    or (scheduled is not null and (stage <> 'published' or scheduled <= stamp))
    or (content_kind not in ('availability','category') and length(btrim(copy)) = 0) then
    raise exception 'Invalid content change' using errcode = '22023';
  end if;
  if item is null then
    insert into public.growth_content_items(kind,module_slug) values(content_kind,target) returning id into item;
  end if;
  update public.growth_content_items set revision = revision + 1
    where id = item and revision = expected and kind = content_kind and module_slug is not distinct from target
    returning revision into next_revision;
  if not found then raise exception 'Content changed since it was opened' using errcode = '40001'; end if;
  insert into public.growth_content_versions(item_id,revision,title,body,category,available,state,effective_at)
    values(item,next_revision,btrim(heading),copy,btrim(category_name),enabled,stage,
      case when stage <> 'draft' then coalesce(scheduled,stamp) end);
  return item;
end $$;

create function growth_editor_private.published_content()
returns table(item_id uuid, kind text, module_slug text, title text, body text, category text, available boolean)
language sql stable security definer set search_path = '' as $$
  select i.id,i.kind,i.module_slug,v.title,v.body,v.category,v.available
  from public.growth_content_items i
  cross join lateral (
    select r.* from public.growth_content_versions r where r.item_id=i.id and r.effective_at <= statement_timestamp()
      order by r.revision desc limit 1
  ) v where v.state='published' and (select auth.uid()) is not null
    and not coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'is_anonymous')::boolean,false)
  order by v.title, i.id;
$$;

create function growth_editor_private.record_module_visit(target text)
returns void language sql security definer set search_path = '' as $$
  delete from growth_editor_private.module_visits
    where month < (date_trunc('month',now() at time zone 'UTC') - interval '1 month')::date
      and (select auth.uid()) is not null;
  insert into growth_editor_private.module_visits(month,module_slug,member_id)
  select date_trunc('month',now() at time zone 'UTC')::date,target,(select auth.uid())
  where (select auth.uid()) is not null
    and not coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'is_anonymous')::boolean,false)
    and target in ('identity-mapping','values-assessment','life-timeline','thought-record','emotional-wheel','cognitive-reframing','inner-critic-dialogue','mood-tracker','relationship-inventory','social-integration','boundary-builder','body-awareness-map','wheel-of-life','future-self-visualization','habit-tracker')
    and not exists (select 1 from growth_editor_private.published_content() c
      where c.kind = 'availability' and c.module_slug = target and not c.available)
  on conflict do nothing;
$$;

create function growth_editor_private.content_engagement()
returns table(module_slug text, member_floor bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists
    (select 1 from public.workbook_editor_accounts where user_id = (select auth.uid())) then
    raise exception 'Editor access required' using errcode = '42501';
  end if;
  return query select v.module_slug,(count(*)/10)*10 from growth_editor_private.module_visits v
    where v.month = (date_trunc('month',now() at time zone 'UTC') - interval '1 month')::date
    group by v.module_slug having count(*) >= 10 order by v.module_slug;
end $$;

create function public.save_growth_content(item uuid, expected integer, content_kind text, target text,
  heading text, copy text, category_name text, enabled boolean, stage text, scheduled timestamptz)
returns uuid language sql set search_path = '' as $$
  select growth_editor_private.save_content(item,expected,content_kind,target,heading,copy,category_name,enabled,stage,scheduled);
$$;
create function public.published_growth_content()
returns table(item_id uuid, kind text, module_slug text, title text, body text, category text, available boolean)
language sql stable set search_path = '' as $$ select * from growth_editor_private.published_content(); $$;
create function public.record_growth_module_visit(target text)
returns void language sql set search_path = '' as $$ select growth_editor_private.record_module_visit(target); $$;
create function public.growth_content_engagement()
returns table(module_slug text, member_floor bigint)
language sql stable set search_path = '' as $$ select * from growth_editor_private.content_engagement(); $$;

revoke all on all functions in schema growth_editor_private from public, anon, authenticated;
grant execute on function growth_editor_private.save_content(uuid,integer,text,text,text,text,text,boolean,text,timestamptz),
  growth_editor_private.published_content(),growth_editor_private.record_module_visit(text),growth_editor_private.content_engagement() to authenticated;
revoke all on function public.save_growth_content(uuid,integer,text,text,text,text,text,boolean,text,timestamptz),
  public.published_growth_content(),public.record_growth_module_visit(text),public.growth_content_engagement() from public, anon, authenticated;
grant execute on function public.save_growth_content(uuid,integer,text,text,text,text,text,boolean,text,timestamptz),
  public.published_growth_content(),public.record_growth_module_visit(text),public.growth_content_engagement() to authenticated;

create view public.growth_content_current with (security_invoker = true) as
select i.id,i.kind,i.module_slug,i.revision,v.title,v.body,v.category,v.available,v.state,v.effective_at,v.saved_at
from public.growth_content_items i join public.growth_content_versions v on v.item_id=i.id and v.revision=i.revision;
revoke all on public.growth_content_current from public, anon, authenticated;
grant select on public.growth_content_current to authenticated;
