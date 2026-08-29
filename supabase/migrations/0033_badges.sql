-- SE7A: earned badges per user.
-- Run after 0032_report_checkpoints.sql.
--
-- Badges are static definitions in code (lib/badges.ts); this table
-- just tracks which ones a user has unlocked and when. The badge_key
-- string is the source of truth — new badges are added by shipping
-- code + retro-evaluating on the next /api/badges call, no migration
-- required for new badges.
--
-- seen_at is nullable so the client can distinguish "just unlocked
-- (needs toast)" from "already-acknowledged". Client sets seen_at to
-- now() after showing the unlock toast.

create table if not exists public.user_badges (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  seen_at timestamptz
);

-- One row per (user, badge) — /api/badges upserts, so re-evaluation
-- doesn't create duplicates.
create unique index if not exists user_badges_dedup
  on public.user_badges (user_id, badge_key);

create index if not exists user_badges_user_idx
  on public.user_badges (user_id, earned_at desc);

alter table public.user_badges enable row level security;

drop policy if exists "user_badges: own rows read"   on public.user_badges;
drop policy if exists "user_badges: own rows insert" on public.user_badges;
drop policy if exists "user_badges: own rows update" on public.user_badges;

create policy "user_badges: own rows read"
  on public.user_badges for select
  using (auth.uid() = user_id);

create policy "user_badges: own rows insert"
  on public.user_badges for insert
  with check (auth.uid() = user_id);

create policy "user_badges: own rows update"
  on public.user_badges for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
