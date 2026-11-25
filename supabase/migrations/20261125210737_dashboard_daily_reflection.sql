alter table public.growth_content_items
  drop constraint growth_content_items_module_slug_check,
  add constraint growth_content_items_module_slug_check check (
    module_slug in ('identity-mapping','values-assessment','life-timeline','thought-record','emotional-wheel','cognitive-reframing','inner-critic-dialogue','mood-tracker','relationship-inventory','social-integration','boundary-builder','body-awareness-map','wheel-of-life','future-self-visualization','habit-tracker')
    or (module_slug = 'dashboard-daily-reflection' and kind = 'prompt')
  );

create view growth_editor_private.eligible_content_versions as
select r.*
from public.growth_content_versions r
where r.effective_at <= statement_timestamp()
  -- A draft saved before the release cancels that pending revision.
  and not exists (
    select 1 from public.growth_content_versions d
    where d.item_id=r.item_id and d.revision > r.revision
      and d.state='draft' and d.saved_at < r.effective_at
  );

create view growth_editor_private.effective_publications as
select i.id as item_id,i.kind,i.module_slug,v.revision,v.title,v.body,v.category,v.available,v.effective_at,v.saved_at
from public.growth_content_items i
cross join lateral (
  select r.* from growth_editor_private.eligible_content_versions r where r.item_id=i.id
  order by r.revision desc limit 1
) v where v.state='published' and (select auth.uid()) is not null
  and not coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'is_anonymous')::boolean,false);

revoke all on growth_editor_private.eligible_content_versions,growth_editor_private.effective_publications
  from public, anon, authenticated;

create or replace function growth_editor_private.published_content()
returns table(item_id uuid, kind text, module_slug text, title text, body text, category text, available boolean)
language sql stable security definer set search_path = '' as $$
  select p.item_id,p.kind,p.module_slug,p.title,p.body,p.category,p.available
  from growth_editor_private.effective_publications p
  where p.module_slug is distinct from 'dashboard-daily-reflection'
  order by p.title,p.item_id;
$$;

create function growth_editor_private.daily_reflection(requested_item uuid, requested_revision integer)
returns table(item_id uuid, revision integer, body text)
language sql stable security definer set search_path = '' as $$
  select p.item_id,coalesce(linked.revision,p.revision),coalesce(linked.body,p.body)
  from growth_editor_private.effective_publications p
  left join lateral (
    select r.revision,r.body
    from growth_editor_private.eligible_content_versions r
    where r.item_id=p.item_id and r.item_id=requested_item and r.revision=requested_revision
      and r.state='published'
      -- Preserve a shown prompt across an update. An intervening archive withdraws it,
      -- and a revision superseded before its release was never available to members.
      and not exists (
        select 1 from growth_editor_private.eligible_content_versions later
        where later.item_id=r.item_id and later.revision > r.revision
          and (later.state='archived' or later.effective_at <= r.effective_at)
      )
  ) linked on true
  where p.module_slug='dashboard-daily-reflection'
  order by (linked.revision is not null) desc,p.effective_at desc,p.saved_at desc,p.item_id
  limit 1;
$$;

create function public.daily_reflection(requested_item uuid default null, requested_revision integer default null)
returns table(item_id uuid, revision integer, body text)
language sql stable set search_path = '' as $$
  select * from growth_editor_private.daily_reflection(requested_item,requested_revision);
$$;

revoke all on function growth_editor_private.daily_reflection(uuid,integer),public.daily_reflection(uuid,integer) from public, anon, authenticated;
grant execute on function growth_editor_private.daily_reflection(uuid,integer),public.daily_reflection(uuid,integer) to authenticated;
