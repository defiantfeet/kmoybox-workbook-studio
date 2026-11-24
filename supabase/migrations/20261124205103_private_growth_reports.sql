create table public.growth_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('weekly','monthly')),
  period_start date not null,
  period_end date not null,
  data_through date not null check (data_through between period_start and period_end),
  timezone text not null check (char_length(timezone) between 1 and 100),
  categories text[] not null,
  reflections jsonb not null default '{}',
  snapshot jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, period_start),
  check (case kind when 'weekly' then extract(isodow from period_start) = 1 and period_end = period_start + 6
    else extract(day from period_start) = 1 and period_end = (period_start + interval '1 month')::date - 1 end),
  check (cardinality(categories) <= 10 and array_position(categories,null) is null and categories <@
    array['activity','emotions','habits','goals','values','social','belonging','relationships','intentions','guided']::text[]),
  check (public.valid_social_fields(reflections, array['learning','challenge','belonging','authenticity','wellbeing','change','support','intention'])),
  check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 100000
    and snapshot - categories = '{}'::jsonb and not (snapshot ? 'guided'))
);
create index growth_reports_owner_history_idx on public.growth_reports(user_id, kind, period_start desc);
alter table public.growth_reports enable row level security;
revoke all on public.growth_reports from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.growth_reports to authenticated;
create policy growth_reports_owner on public.growth_reports for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger growth_reports_timestamp before update on public.growth_reports
  for each row execute function public.touch_growth_timestamp();

alter table public.notification_preferences
  add column weekly_growth_report_reminder boolean not null default false,
  add column monthly_growth_report_reminder boolean not null default false;

create or replace function public.delete_personal_activity()
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  delete from public.growth_reports where user_id = owner_id;
  delete from public.social_interactions where user_id = owner_id;
  delete from public.social_goals where user_id = owner_id;
  delete from public.notification_preferences where user_id = owner_id;
  update public.profiles set growth_timezone = default where id = owner_id;
  delete from public.supportive_statements where user_id = owner_id;
  delete from public.growth_exercises where user_id = owner_id;
  delete from public.growth_check_ins where user_id = owner_id;
  delete from public.growth_weekly_reflections where user_id = owner_id;
  delete from public.growth_habits where user_id = owner_id;
  delete from public.journal_entries where user_id = owner_id;
  delete from public.goals where user_id = owner_id;
  delete from public.responses where user_id = owner_id;
  delete from public.engine_progress where user_id = owner_id;
end;
$$;
create or replace function public.export_personal_activity()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'growthProfile', (select jsonb_build_object('timezone', growth_timezone) from public.profiles where id = (select auth.uid())),
    'socialGoals', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by created_at, id) from public.social_goals g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'socialInteractions', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by occurred_at, id) from public.social_interactions g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'notificationPreferences', (select to_jsonb(g) - 'user_id' from public.notification_preferences g where g.user_id = (select auth.uid())),
    'valuesPractices', coalesce((select jsonb_agg(to_jsonb(v) - 'user_id' order by created_at, id) from public.values_practices v where v.user_id = (select auth.uid())), '[]'::jsonb),
    'supportiveStatements', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by created_at, id) from public.supportive_statements s where s.user_id = (select auth.uid())), '[]'::jsonb),
    'boundaryPracticeEntries', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id' order by occurred_on, created_at, id) from public.boundary_practice_entries b where b.user_id = (select auth.uid())), '[]'::jsonb),
    'timelineImages', coalesce((select jsonb_agg(jsonb_build_object('eventId', i.event_id, 'mimeType', i.mime_type,
      'base64', replace(encode(i.content,'base64'),chr(10),'')) order by i.event_id)
      from public.timeline_images i where i.user_id = (select auth.uid())), '[]'::jsonb),
    'growthReports', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by period_start, kind)
      from public.growth_reports r where r.user_id = (select auth.uid())), '[]'::jsonb),
    'growthExercises', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by module_slug, updated_at, id) from public.growth_exercises g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'growthCheckIns', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by local_date, slot) from public.growth_check_ins g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'growthWeeklyReflections', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by week_start) from public.growth_weekly_reflections g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'growthHabits', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by started_on, id) from public.growth_habits g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'growthHabitLogs', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by local_date, habit_id) from public.growth_habit_logs g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'journalEntries', coalesce((select jsonb_agg(to_jsonb(j) - 'user_id' order by created_at) from public.journal_entries j where j.user_id = (select auth.uid())), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by created_at) from public.goals g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'milestones', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by created_at) from public.goal_milestones m where m.user_id = (select auth.uid())), '[]'::jsonb),
    'goalHistory', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id' order by created_at) from public.goal_activity h where h.user_id = (select auth.uid())), '[]'::jsonb),
    'workbookResponses', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by prompt_id) from public.responses r where r.user_id = (select auth.uid())), '[]'::jsonb),
    'moduleResponses', coalesce((select jsonb_agg(to_jsonb(p) - 'user_id' order by updated_at) from public.engine_progress p where p.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;
