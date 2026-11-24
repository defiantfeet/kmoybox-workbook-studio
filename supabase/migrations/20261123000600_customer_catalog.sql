-- Retain seeded content, responses, and entitlements while retiring the sample catalog.
alter table public.products add column sample boolean not null default false;
update public.products set sample = true
where (slug, title) in (
  ('finding-my-voice', 'Finding My Voice'),
  ('the-boundaries-edit', 'The Boundaries Edit'),
  ('becoming-her', 'Becoming Her')
);

alter policy catalog_read on public.products using (not sample);
alter policy prompts_read on public.prompts using (
  exists (
    select 1 from public.products p where p.slug = product_slug and (
      p.free or exists (
        select 1 from public.entitlements e where e.product_slug = p.slug and e.user_id = (select auth.uid())
      )
    )
  )
);

create or replace function public.engine_can_read_workbook(book_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.engine_workbooks b where b.slug = book_slug and not b.sample and
    (not b.requires_purchase or exists (
      select 1 from public.workbook_purchases p
      where p.workbook_slug = b.slug and p.user_id = (select auth.uid()) and p.status = 'paid'
    ))
  );
$$;

create or replace function public.engine_is_published(book_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.engine_modules m join public.engine_workbooks b on b.slug = m.workbook_slug
    where m.workbook_slug = book_slug and not b.sample);
$$;

-- Editor creation still checks hidden legacy slugs to prevent ambiguous routes.
create function public.editor_can_create_workbook(book_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workbook_editor_accounts where user_id = (select auth.uid()))
    and not exists (select 1 from public.products where slug = book_slug);
$$;
revoke all on function public.editor_can_create_workbook(text) from public, anon, authenticated;
grant execute on function public.editor_can_create_workbook(text) to authenticated;
alter policy engine_workbooks_create on public.engine_workbooks
  with check (not sample and not requires_purchase and public.editor_can_create_workbook(slug));

create or replace function public.workbook_storefront()
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
