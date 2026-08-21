-- SE7A: sleep sessions.
-- Run after 0019_ramadan.sql.
--
-- One row per sleep session, sourced from Whoop, Oura, HealthKit, or
-- manual entry. Every row is anchored to a `night_date` — the
-- CALENDAR DATE OF THE WAKE, i.e. sleep that started Sunday evening
-- and ended Monday morning belongs to "Monday's" night_date. This
-- matches the convention both Whoop and Oura use in their APIs and
-- is what most users mean when they say "how did I sleep last night".
--
-- Dedupe: (user_id, source, provider_session_id) is unique when
-- provider_session_id is set, so re-runs of an hourly sync are idempotent.
-- Manual entries don't have a provider_session_id and skip the dedupe.

create table if not exists public.sleep_sessions (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  source text not null check (source in ('whoop','oura','healthkit','manual')),
  provider_session_id text,
  night_date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes int not null check (duration_minutes > 0 and duration_minutes <= 1440),
  time_in_bed_minutes int check (time_in_bed_minutes >= 0 and time_in_bed_minutes <= 1440),
  sleep_score int check (sleep_score >= 0 and sleep_score <= 100),
  deep_minutes int check (deep_minutes >= 0),
  rem_minutes int check (rem_minutes >= 0),
  light_minutes int check (light_minutes >= 0),
  awake_minutes int check (awake_minutes >= 0),
  hrv_ms numeric check (hrv_ms >= 0 and hrv_ms <= 500),
  resting_hr_bpm int check (resting_hr_bpm >= 20 and resting_hr_bpm <= 200),
  respiratory_rate numeric check (respiratory_rate >= 0 and respiratory_rate <= 60),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sleep_sessions_user_night_idx
  on public.sleep_sessions (user_id, night_date desc);

create unique index if not exists sleep_sessions_provider_unique
  on public.sleep_sessions (user_id, source, provider_session_id)
  where provider_session_id is not null;

alter table public.sleep_sessions enable row level security;

drop policy if exists "sleep_sessions: own rows read"   on public.sleep_sessions;
drop policy if exists "sleep_sessions: own rows insert" on public.sleep_sessions;
drop policy if exists "sleep_sessions: own rows update" on public.sleep_sessions;
drop policy if exists "sleep_sessions: own rows delete" on public.sleep_sessions;

create policy "sleep_sessions: own rows read"
  on public.sleep_sessions for select using (auth.uid() = user_id);

create policy "sleep_sessions: own rows insert"
  on public.sleep_sessions for insert with check (auth.uid() = user_id);

create policy "sleep_sessions: own rows update"
  on public.sleep_sessions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sleep_sessions: own rows delete"
  on public.sleep_sessions for delete using (auth.uid() = user_id);
