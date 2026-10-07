-- SE7A: scaffold Ultrahuman as a 4th biosignal integration.
--
-- UH's Partner API model is different from Oura/Whoop/Strava: there's
-- no per-user OAuth. SE7A holds a single master API Token (env
-- UH_API_TOKEN), each user enters SE7A's static sharing code
-- (UH_SHARE_CODE) in their Ultrahuman app, then provides their UH
-- account email. From that point SE7A queries UH with the email param.
--
-- Storage model: reuse user_integrations as the connection registry.
--   - provider        = 'ultrahuman'
--   - provider_user_id = the user's UH email (not auth email — may differ)
--   - access_token    = 'via_master_token' sentinel (real token lives in env)
--   - no refresh flow — the master token rotates manually.

alter table public.user_integrations
  drop constraint if exists user_integrations_provider_check;

alter table public.user_integrations
  add constraint user_integrations_provider_check
  check (provider in ('strava','whoop','oura','fitbit','ultrahuman'));

alter table public.sleep_sessions
  drop constraint if exists sleep_sessions_source_check;

alter table public.sleep_sessions
  add constraint sleep_sessions_source_check
  check (source in ('whoop','oura','ultrahuman','healthkit','manual'));

alter table public.recovery_scores
  drop constraint if exists recovery_scores_source_check;

alter table public.recovery_scores
  add constraint recovery_scores_source_check
  check (source in ('whoop','oura','ultrahuman','healthkit','health_connect','manual'));

alter table public.cardio_sessions
  drop constraint if exists cardio_sessions_source_check;

alter table public.cardio_sessions
  add constraint cardio_sessions_source_check
  check (source in ('manual','healthkit','strava','whoop','oura','ultrahuman','fitbit'));

-- Daily metabolic/glucose metrics — UH is currently the only source
-- (M1 ring CGM). Keyed on (user_id, day) so re-syncs upsert cleanly.
create table if not exists public.glucose_daily (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  source text not null check (source in ('ultrahuman','manual')),
  day date not null,
  average_glucose_mgdl numeric check (average_glucose_mgdl is null or (average_glucose_mgdl >= 0 and average_glucose_mgdl <= 600)),
  glucose_variability_pct numeric check (glucose_variability_pct is null or (glucose_variability_pct >= 0 and glucose_variability_pct <= 100)),
  time_in_target_pct numeric check (time_in_target_pct is null or (time_in_target_pct >= 0 and time_in_target_pct <= 100)),
  hba1c_estimated numeric check (hba1c_estimated is null or (hba1c_estimated >= 0 and hba1c_estimated <= 20)),
  metabolic_score int check (metabolic_score is null or (metabolic_score >= 0 and metabolic_score <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists glucose_daily_dedup
  on public.glucose_daily (user_id, source, day);

create index if not exists glucose_daily_user_day_idx
  on public.glucose_daily (user_id, day desc);

alter table public.glucose_daily enable row level security;

drop policy if exists "glucose_daily: own rows read" on public.glucose_daily;

create policy "glucose_daily: own rows read"
  on public.glucose_daily for select using (auth.uid() = user_id);
-- Writes are service-role-only (sync adapters).
