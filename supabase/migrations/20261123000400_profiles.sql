create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80)
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_owner_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_owner_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function public.provision_studio_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, case when jsonb_typeof(new.raw_user_meta_data->'display_name') = 'string'
    then left(btrim(new.raw_user_meta_data->>'display_name'), 80) else '' end)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.provision_studio_profile() from public, anon, authenticated;
create trigger provision_studio_profile after insert on auth.users for each row execute function public.provision_studio_profile();

insert into public.profiles (id, display_name)
select id, case when jsonb_typeof(raw_user_meta_data->'display_name') = 'string'
  then left(btrim(raw_user_meta_data->>'display_name'), 80) else '' end
from auth.users on conflict (id) do nothing;
