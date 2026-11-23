alter table public.engine_workbooks add column requires_purchase boolean not null default false;

create table public.workbook_prices (
  workbook_slug text primary key references public.engine_workbooks on delete cascade,
  stripe_price_id text not null unique check (stripe_price_id ~ '^price_[a-zA-Z0-9_]+$'),
  amount integer not null check (amount between 50 and 99999999),
  currency text not null default 'usd' check (currency = 'usd'),
  active boolean not null default true
);

create table public.workbook_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workbook_slug text not null references public.engine_workbooks,
  title text not null,
  stripe_price_id text not null,
  amount integer not null check (amount >= 50),
  currency text not null check (currency = 'usd'),
  status text not null default 'pending' check (status in ('pending','paid','failed','expired','refunded','revoked')),
  stripe_session_id text unique,
  stripe_payment_id text unique,
  refunded_amount integer not null default 0 check (refunded_amount between 0 and amount),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workbook_pending_purchase on public.workbook_purchases (user_id, workbook_slug) where status = 'pending';
create index workbook_purchase_history on public.workbook_purchases (user_id, created_at desc);
create index workbook_paid_access on public.workbook_purchases (user_id, workbook_slug) where status = 'paid';

create table public.workbook_payment_events (
  event_id text primary key,
  purchase_id uuid not null references public.workbook_purchases on delete cascade,
  received_at timestamptz not null default now()
);

alter table public.workbook_prices enable row level security;
alter table public.workbook_purchases enable row level security;
alter table public.workbook_payment_events enable row level security;
revoke all on public.workbook_prices, public.workbook_purchases, public.workbook_payment_events from public, anon, authenticated;
grant select on public.workbook_purchases to authenticated;
create policy workbook_purchase_owner on public.workbook_purchases for select to authenticated using (user_id = (select auth.uid()));

create function public.engine_can_read_workbook(book_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.engine_workbooks b where b.slug = book_slug and
    (not b.requires_purchase or exists (
      select 1 from public.workbook_purchases p
      where p.workbook_slug = b.slug and p.user_id = (select auth.uid()) and p.status = 'paid'
    ))
  );
$$;

create function public.engine_is_published(book_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.engine_modules m where m.workbook_slug = book_slug);
$$;

revoke all on function public.engine_can_read_workbook(text), public.engine_is_published(text) from public, anon, authenticated;
grant execute on function public.engine_can_read_workbook(text), public.engine_is_published(text) to authenticated;

drop policy engine_workbooks_read on public.engine_workbooks;
create policy engine_workbooks_read on public.engine_workbooks for select to authenticated
  using (public.engine_is_published(slug) or exists (select 1 from public.workbook_editor_accounts));

drop policy engine_workbooks_create on public.engine_workbooks;
create policy engine_workbooks_create on public.engine_workbooks for insert to authenticated
  with check (exists (select 1 from public.workbook_editor_accounts) and not sample and not requires_purchase
    and not exists (select 1 from public.products where products.slug = engine_workbooks.slug));

drop policy engine_modules_read on public.engine_modules;
create policy engine_modules_read on public.engine_modules for select to authenticated
  using (public.engine_can_read_workbook(workbook_slug) or exists (select 1 from public.workbook_editor_accounts));

drop policy engine_progress_create on public.engine_progress;
create policy engine_progress_create on public.engine_progress for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.engine_modules m where m.id = module_id and public.engine_can_read_workbook(m.workbook_slug)
  )
);
drop policy engine_progress_update on public.engine_progress;
create policy engine_progress_update on public.engine_progress for update to authenticated using (user_id = (select auth.uid())) with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.engine_modules m where m.id = module_id and public.engine_can_read_workbook(m.workbook_slug)
  )
);

create function public.workbook_storefront()
returns table (
  slug text, title text, summary text, sample boolean, requires_purchase boolean,
  unlocked boolean, owned boolean, amount integer, currency text
)
language sql stable security definer set search_path = '' as $$
  select b.slug, b.title, b.summary, b.sample, b.requires_purchase,
    not b.requires_purchase or p.owned, p.owned, price.amount, price.currency
  from public.engine_workbooks b
  cross join lateral (
    select exists (
      select 1 from public.workbook_purchases p
      where p.workbook_slug = b.slug and p.user_id = (select auth.uid()) and p.status = 'paid'
    ) as owned
  ) p
  left join public.workbook_prices price on price.workbook_slug = b.slug and price.active and b.requires_purchase
  where (select auth.uid()) is not null and public.engine_is_published(b.slug)
  order by b.title;
$$;
revoke all on function public.workbook_storefront() from public, anon, authenticated;
grant execute on function public.workbook_storefront() to authenticated;

create function public.reserve_workbook_checkout(owner_id uuid, book_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  offer record;
  purchase public.workbook_purchases%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':' || book_slug, 0));
  select b.title, pr.stripe_price_id, pr.amount, pr.currency into offer
  from public.engine_workbooks b join public.workbook_prices pr on pr.workbook_slug = b.slug
  where b.slug = book_slug and b.requires_purchase and pr.active and public.engine_is_published(b.slug);
  if not found then return null; end if;
  if exists (select 1 from public.workbook_purchases p where p.user_id = owner_id and p.workbook_slug = book_slug and p.status in ('paid', 'revoked')) then
    return null;
  end if;
  select * into purchase from public.workbook_purchases p
  where p.user_id = owner_id and p.workbook_slug = book_slug and p.status = 'pending';
  if found and (purchase.stripe_price_id <> offer.stripe_price_id or purchase.amount <> offer.amount or purchase.currency <> offer.currency) then
    return null;
  end if;
  if not found then
    insert into public.workbook_purchases (user_id, workbook_slug, title, stripe_price_id, amount, currency)
    values (owner_id, book_slug, offer.title, offer.stripe_price_id, offer.amount, offer.currency)
    returning * into purchase;
  end if;
  return to_jsonb(purchase);
end;
$$;

create function public.bind_workbook_checkout(purchase_id uuid, session_id text)
returns boolean language sql security definer set search_path = '' as $$
  with bound as (
    update public.workbook_purchases set stripe_session_id = session_id
    where id = purchase_id and (stripe_session_id is null or stripe_session_id = session_id)
    returning id
  )
  select exists (select 1 from bound);
$$;

create function public.record_workbook_payment(
  event_id text, purchase_id uuid, session_id text, payment_id text,
  payment_state text, received_amount integer, payment_currency text, refund_total integer
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  purchase public.workbook_purchases%rowtype;
  inserted integer;
begin
  select * into purchase from public.workbook_purchases where id = purchase_id for update;
  if not found then return 'missing'; end if;
  if (session_id is not null and purchase.stripe_session_id is not null and purchase.stripe_session_id <> session_id)
      or (payment_id is not null and purchase.stripe_payment_id is not null and purchase.stripe_payment_id <> payment_id)
      or payment_state not in ('paid','expired','failed','refund')
      or (payment_state in ('paid','refund') and (payment_id is null
          or received_amount is distinct from purchase.amount or payment_currency is distinct from purchase.currency
          or refund_total is null or refund_total < 0 or refund_total > purchase.amount))
  then return 'mismatch'; end if;

  insert into public.workbook_payment_events (event_id, purchase_id) values (event_id, purchase_id) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;

  update public.workbook_purchases
  set stripe_session_id = coalesce(stripe_session_id, session_id),
      stripe_payment_id = coalesce(stripe_payment_id, payment_id),
      refunded_amount = greatest(refunded_amount, coalesce(refund_total, 0)),
      status = case
        when status = 'revoked' then 'revoked'
        when status = 'refunded' or coalesce(refund_total, 0) = amount then 'refunded'
        when payment_state = 'paid' then 'paid'
        when status = 'pending' and payment_state in ('failed','expired') then payment_state
        else status
      end,
      updated_at = now()
  where id = purchase_id;
  return 'recorded';
end;
$$;

revoke all on function public.reserve_workbook_checkout(uuid,text), public.bind_workbook_checkout(uuid,text),
  public.record_workbook_payment(text,uuid,text,text,text,integer,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_workbook_checkout(uuid,text), public.bind_workbook_checkout(uuid,text),
  public.record_workbook_payment(text,uuid,text,text,text,integer,text,integer) to service_role;
