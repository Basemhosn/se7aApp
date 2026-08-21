-- SE7A: cardio sessions (runs, rides, walks, swims, misc) and a step
-- count log for HealthKit auto-import.
-- Run after 0016_notifications.sql.

-- ──────────────────────────────────────────────────────────────────────────────
-- cardio_sessions: one row per cardio session, whether logged manually
-- or imported from Apple HealthKit. HealthKit workout samples get a
-- hk_uuid so we can dedupe on re-import.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.cardio_sessions (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('run','walk','ride','swim','row','elliptical','hike','other')),
  started_at timestamptz not null default now(),
  duration_min numeric not null check (duration_min > 0 and duration_min <= 1440),
  distance_km numeric check (distance_km >= 0 and distance_km <= 500),
  kcal_burned int check (kcal_burned >= 0 and kcal_burned <= 10000),
  avg_hr int check (avg_hr >= 30 and avg_hr <= 250),
  source text not null default 'manual' check (source in ('manual','healthkit')),
  hk_uuid text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists cardio_sessions_user_started_idx
  on public.cardio_sessions (user_id, started_at desc);

create unique index if not exists cardio_sessions_hk_uuid_unique
  on public.cardio_sessions (user_id, hk_uuid)
  where hk_uuid is not null;

alter table public.cardio_sessions enable row level security;

drop policy if exists "cardio_sessions: own rows read"   on public.cardio_sessions;
drop policy if exists "cardio_sessions: own rows insert" on public.cardio_sessions;
drop policy if exists "cardio_sessions: own rows update" on public.cardio_sessions;
drop policy if exists "cardio_sessions: own rows delete" on public.cardio_sessions;

create policy "cardio_sessions: own rows read"
  on public.cardio_sessions for select using (auth.uid() = user_id);

create policy "cardio_sessions: own rows insert"
  on public.cardio_sessions for insert with check (auth.uid() = user_id);

create policy "cardio_sessions: own rows update"
  on public.cardio_sessions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cardio_sessions: own rows delete"
  on public.cardio_sessions for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- daily_activity: one row per (user, local date) with step count +
-- active energy burned. Sourced from HealthKit auto-import. Not
-- authoritative for individual samples; represents SE7A's daily view.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_activity (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  steps int check (steps >= 0),
  active_kcal int check (active_kcal >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists daily_activity_updated_idx
  on public.daily_activity (updated_at desc);

alter table public.daily_activity enable row level security;

drop policy if exists "daily_activity: own rows read"   on public.daily_activity;
drop policy if exists "daily_activity: own rows write"  on public.daily_activity;

create policy "daily_activity: own rows read"
  on public.daily_activity for select using (auth.uid() = user_id);

create policy "daily_activity: own rows write"
  on public.daily_activity for insert with check (auth.uid() = user_id);

create policy "daily_activity: own rows update"
  on public.daily_activity for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
