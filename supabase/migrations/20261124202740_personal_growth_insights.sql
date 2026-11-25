alter table public.notification_preferences
  add column hidden_growth_insights text[] not null default array['observations']::text[],
  add constraint hidden_growth_insights_known check (
    cardinality(hidden_growth_insights) <= 13 and array_position(hidden_growth_insights,null) is null
    and hidden_growth_insights <@ array['activity','reflections','goals','values','habits','mood','emotions','social',
      'belonging','boundaries','wheel','milestones','observations']::text[]
  );
