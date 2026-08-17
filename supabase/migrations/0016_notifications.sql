-- SE7A: notification preferences + dedupe log.
-- Run after 0015_subscriptions.sql.
--
-- Two pieces:
-- 1. profile columns for user-controlled toggles + timezone (so the
--    hourly cron knows what "9pm local" means for each user).
-- 2. notifications_sent log so we never send the same nudge twice on
--    the same day (crons are at-least-once, and we want at-most-once
--    per user per rule per day).

alter table public.profiles
  add column if not exists notification_prefs jsonb
    default jsonb_build_object(
      'streak_at_risk', true,
      'lunch_nudge',    true,
      'weigh_in',       true,
      'pr_celebration', true,
      'plan_your_week', true,
      'weekly_recap',   true
    );

alter table public.profiles
  add column if not exists tz_offset_min int default 0;

-- Backfill any pre-existing rows that were null.
update public.profiles
  set notification_prefs = jsonb_build_object(
    'streak_at_risk', true,
    'lunch_nudge',    true,
    'weigh_in',       true,
    'pr_celebration', true,
    'plan_your_week', true,
    'weekly_recap',   true
  )
  where notification_prefs is null;

-- ──────────────────────────────────────────────────────────────────────────────
-- notifications_sent: dedupe log keyed by (user, kind, day). Row exists =
-- already fired. For event-driven pushes (PR celebration) the day_key is
-- the workout date so multiple PRs in one session collapse.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications_sent (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  day_key text not null,          -- YYYY-MM-DD in user local time
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, day_key)
);

create index if not exists notifications_sent_sent_at_idx
  on public.notifications_sent (sent_at desc);

alter table public.notifications_sent enable row level security;
-- No policies. Service role only (cron + event handlers).
