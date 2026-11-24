-- Local browser fixture. Run only against an isolated synthetic database.
insert into public.engine_workbooks (slug,title,summary)
values ('customer-audit-fixture','Synthetic Customer Workbook','Local customer lifecycle fixture.')
on conflict (slug) do nothing;
insert into public.engine_module_drafts (id,workbook_slug,content,edit_version)
values ('00000000-0000-4000-8000-000000000092','customer-audit-fixture',
  '{"format":1,"title":"Practice","chapter":"First steps","chapterOrder":1,"order":1,"blocks":[{"id":"00000000-0000-4000-8000-000000000093","kind":"reflection","prompt":"What did you practice?"}]}'::jsonb,1)
on conflict (id) do nothing;

insert into public.engine_modules (id,workbook_slug,content,revision)
select id,workbook_slug,content,edit_version from public.engine_module_drafts where workbook_slug = 'customer-audit-fixture'
on conflict (id) do nothing;
