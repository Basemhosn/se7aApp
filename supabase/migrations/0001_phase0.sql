-- SE7A Phase 0: auth-linked profiles + weight history
-- Run this against the se7a-prod Supabase project before shipping Phase 0.
-- Idempotent where reasonable; safe to re-run.

-- ──────────────────────────────────────────────────────────────────────────────
-- profiles: 1:1 with auth.users. Drives macro targets.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text,
  sex text check (sex in ('male','female')),
  birthdate date,
  height_cm numeric check (height_cm > 0 and height_cm < 280),
  weight_kg numeric check (weight_kg > 0 and weight_kg < 500),
  activity_level text check (activity_level in
    ('sedentary','light','moderate','active','very_active')),
  goal text check (goal in ('cut','recomp','maintain','bulk')),
  goal_rate_kg_per_week numeric check (goal_rate_kg_per_week between -1.5 and 1.0),
  daily_kcal_target int,
  daily_protein_g int,
  daily_carb_g int,
  daily_fat_g int,
  units text not null default 'metric' check (units in ('metric','imperial')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- weight_logs: every weight check-in, retunes targets when re-read.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.weight_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  weight_kg numeric not null check (weight_kg > 0 and weight_kg < 500),
  body_fat_pct numeric check (body_fat_pct between 3 and 60),
  logged_at timestamptz not null default now()
);

create index if not exists weight_logs_user_logged_at_idx
  on public.weight_logs (user_id, logged_at desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- Auto-create a profile stub on signup so we never have a user without a row.
-- The user fills in the rest via /onboarding.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────────────
-- Row Level Security: a user can only see and mutate their own rows.
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.weight_logs enable row level security;

drop policy if exists "profiles: own row read"   on public.profiles;
drop policy if exists "profiles: own row write"  on public.profiles;
drop policy if exists "profiles: own row update" on public.profiles;

create policy "profiles: own row read"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "profiles: own row update"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No INSERT policy: rows are created exclusively by the handle_new_user trigger.
-- No DELETE policy: profile is removed when auth.users row is deleted (cascade).

drop policy if exists "weight_logs: own rows read"   on public.weight_logs;
drop policy if exists "weight_logs: own rows insert" on public.weight_logs;
drop policy if exists "weight_logs: own rows delete" on public.weight_logs;

create policy "weight_logs: own rows read"
  on public.weight_logs for select
  using (auth.uid() = user_id);

create policy "weight_logs: own rows insert"
  on public.weight_logs for insert
  with check (auth.uid() = user_id);

create policy "weight_logs: own rows delete"
  on public.weight_logs for delete
  using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Waitlist already exists. Make sure RLS is enforced. No-op if already set.
-- ──────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'waitlist') then
    execute 'alter table public.waitlist enable row level security';
  end if;
end$$;
