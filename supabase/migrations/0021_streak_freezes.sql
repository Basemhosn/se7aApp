-- SE7A: streak freezes (Duolingo-style consumables).
-- Run after 0020_sleep.sql.
--
-- A freeze protects a single past day from breaking a log streak. Users
-- earn 2 freezes per calendar month (rate-limited server-side by
-- counting rows created within the current month). A freeze cannot be
-- applied to a day the user already logged; the client hides the
-- affordance in that case and the /streaks/freeze route rejects it.
--
-- One row per (user, freeze_date). The freeze_date is the DAY BEING
-- PROTECTED — not the day the user tapped the button. `created_at` is
-- the spend time, used for the monthly budget check.

create table if not exists public.streak_freezes (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  freeze_date date not null,
  created_at timestamptz not null default now()
);

create unique index if not exists streak_freezes_user_date_unique
  on public.streak_freezes (user_id, freeze_date);

create index if not exists streak_freezes_user_created_idx
  on public.streak_freezes (user_id, created_at desc);

alter table public.streak_freezes enable row level security;

drop policy if exists "streak_freezes: own rows read"   on public.streak_freezes;
drop policy if exists "streak_freezes: own rows insert" on public.streak_freezes;
drop policy if exists "streak_freezes: own rows delete" on public.streak_freezes;

create policy "streak_freezes: own rows read"
  on public.streak_freezes for select using (auth.uid() = user_id);

-- Insert is allowed from the client so the POST /streaks/freeze route
-- (which uses the user's session) can write. Budget enforcement is
-- in the route, not the DB — the DB just ensures dedupe via the
-- unique index above.
create policy "streak_freezes: own rows insert"
  on public.streak_freezes for insert with check (auth.uid() = user_id);

create policy "streak_freezes: own rows delete"
  on public.streak_freezes for delete using (auth.uid() = user_id);
