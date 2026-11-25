alter table public.growth_content_versions alter column saved_at set default statement_timestamp();

create or replace function growth_editor_private.published_content()
returns table(item_id uuid, kind text, module_slug text, title text, body text, category text, available boolean)
language sql stable security definer set search_path = '' as $$
  select i.id,i.kind,i.module_slug,v.title,v.body,v.category,v.available
  from public.growth_content_items i
  cross join lateral (
    select r.*
    from public.growth_content_versions r
    where r.item_id=i.id and r.effective_at <= statement_timestamp()
      -- A draft saved before a scheduled revision takes effect cancels that revision.
      -- Revisions already effective when the draft was saved remain eligible.
      and not exists (
        select 1 from public.growth_content_versions d
        where d.item_id=r.item_id and d.revision > r.revision
          and d.state='draft' and d.saved_at < r.effective_at
      )
    order by r.revision desc limit 1
  ) v where v.state='published' and (select auth.uid()) is not null
    and not coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'is_anonymous')::boolean,false)
  order by v.title, i.id;
$$;
