-- SE7A Phase 3: workout programming + expanded onboarding profile.
-- Run after 0005_delete_user.sql. Idempotent where reasonable.
--
-- Design note: the workout program catalog lives in lib/programs/catalog.ts
-- as the single source of truth (also served to mobile via /api/workouts/
-- catalog). We store only the program's string slug in user_programs so we
-- don't have to sync a DB table with the code catalog.

-- ──────────────────────────────────────────────────────────────────────────────
-- Expand profiles with fields the workout selector needs.
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists training_experience text
    check (training_experience in ('beginner','intermediate','advanced'));

alter table public.profiles
  add column if not exists equipment_access text
    check (equipment_access in ('bodyweight','home','gym','both'));

alter table public.profiles
  add column if not exists days_per_week int
    check (days_per_week between 2 and 7);

-- Free-text list of injuries or movements to avoid. Empty array by default.
alter table public.profiles
  add column if not exists injuries jsonb not null default '[]'::jsonb;

-- ──────────────────────────────────────────────────────────────────────────────
-- user_programs: one row per user representing their active program.
-- program_id is a slug from lib/programs/catalog.ts (not a FK — catalog is
-- code-owned).
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_programs (
  user_id uuid primary key references auth.users on delete cascade,
  program_id text not null,
  week_number int not null default 1 check (week_number > 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_programs_set_updated_at on public.user_programs;
create trigger user_programs_set_updated_at
  before update on public.user_programs
  for each row execute function public.tg_set_updated_at();

alter table public.user_programs enable row level security;

drop policy if exists "user_programs: own row read"   on public.user_programs;
drop policy if exists "user_programs: own row write"  on public.user_programs;
drop policy if exists "user_programs: own row update" on public.user_programs;
drop policy if exists "user_programs: own row delete" on public.user_programs;

create policy "user_programs: own row read"
  on public.user_programs for select using (auth.uid() = user_id);

create policy "user_programs: own row write"
  on public.user_programs for insert with check (auth.uid() = user_id);

create policy "user_programs: own row update"
  on public.user_programs for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_programs: own row delete"
  on public.user_programs for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- workout_sessions: one row per completed session. Exercises + sets stored
-- as jsonb to keep the schema flexible while templates evolve.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.workout_sessions (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  program_id text,                           -- slug snapshot at time of session
  session_index int not null,                -- which day within the program (0-indexed)
  session_name text not null,
  exercises jsonb not null,                  -- [{ name, sets: [{ reps, weight_kg, rpe }] }]
  duration_min int,
  notes text,
  completed_at timestamptz not null default now()
);

create index if not exists workout_sessions_user_completed_idx
  on public.workout_sessions (user_id, completed_at desc);

alter table public.workout_sessions enable row level security;

drop policy if exists "workout_sessions: own rows read"   on public.workout_sessions;
drop policy if exists "workout_sessions: own rows insert" on public.workout_sessions;
drop policy if exists "workout_sessions: own rows delete" on public.workout_sessions;

create policy "workout_sessions: own rows read"
  on public.workout_sessions for select using (auth.uid() = user_id);

create policy "workout_sessions: own rows insert"
  on public.workout_sessions for insert with check (auth.uid() = user_id);

create policy "workout_sessions: own rows delete"
  on public.workout_sessions for delete using (auth.uid() = user_id);
