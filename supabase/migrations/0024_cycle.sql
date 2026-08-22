-- SE7A: menstrual cycle tracking (opt-in).
-- Run after 0023_profile_city.sql.
--
-- Privacy-sensitive per the SE7A commitments. Design choices:
--   - Feature is off by default. cycle_prefs.enabled must be flipped on
--     explicitly from Settings — never auto-enabled based on `sex`.
--   - We only store cycle START dates + optional flow/notes. No forced
--     symptom tracking, no cross-user aggregation, no exports.
--   - RLS is strict: users can only ever see/write their own rows.
--   - When the user turns the feature off, the cycle_prefs.enabled
--     flag hides it in the app but the raw rows stay so re-enabling
--     doesn't lose history. Users can delete individual entries.

create table if not exists public.cycle_periods (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  started_on date not null,
  ended_on date check (ended_on is null or ended_on >= started_on),
  flow text check (flow is null or flow in ('spotting','light','medium','heavy')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate entries for the same start date (users
-- accidentally double-tapping the log button).
create unique index if not exists cycle_periods_user_start_unique
  on public.cycle_periods (user_id, started_on);

create index if not exists cycle_periods_user_start_idx
  on public.cycle_periods (user_id, started_on desc);

alter table public.cycle_periods enable row level security;

drop policy if exists "cycle_periods: own rows read"   on public.cycle_periods;
drop policy if exists "cycle_periods: own rows insert" on public.cycle_periods;
drop policy if exists "cycle_periods: own rows update" on public.cycle_periods;
drop policy if exists "cycle_periods: own rows delete" on public.cycle_periods;

create policy "cycle_periods: own rows read"
  on public.cycle_periods for select using (auth.uid() = user_id);

create policy "cycle_periods: own rows insert"
  on public.cycle_periods for insert with check (auth.uid() = user_id);

create policy "cycle_periods: own rows update"
  on public.cycle_periods for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cycle_periods: own rows delete"
  on public.cycle_periods for delete using (auth.uid() = user_id);

-- Per-user cycle preferences on the profile. Kept as jsonb so we can
-- extend (symptom tracking, PMS notification prefs) without another
-- migration.
alter table public.profiles
  add column if not exists cycle_prefs jsonb
    default jsonb_build_object(
      'enabled', false,
      'avg_cycle_length_days', 28,
      'avg_period_length_days', 5,
      'share_with_coach', true
    );
