-- SE7A: subscriptions + Pro entitlement.
-- Run after 0014_progress_photos_measurements.sql.
--
-- Source of truth is RevenueCat. Their webhook writes to this table via
-- the service role (see /api/rc/webhook). The mobile app reads the same
-- entitlement locally through the RC SDK for instant UX, but every
-- server-side gate re-checks this table so a jailbroken client can't
-- fake Pro. Users can read their own row (for the Settings screen);
-- only the service role writes.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users on delete cascade,
  tier text not null default 'free' check (tier in ('free','pro')),
  status text not null default 'inactive'
    check (status in ('inactive','trial','active','grace','cancelled','expired','billing_issue')),
  rc_app_user_id text,                     -- RevenueCat app_user_id (== our user_id)
  rc_original_transaction_id text,
  rc_product_id text,                      -- e.g. 'se7a_pro_monthly' | 'se7a_pro_annual'
  rc_environment text,                     -- 'PRODUCTION' | 'SANDBOX'
  period_type text,                        -- 'NORMAL' | 'TRIAL' | 'INTRO'
  purchased_at timestamptz,
  expires_at timestamptz,
  will_renew boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_tier_status_idx
  on public.subscriptions (tier, status);

create index if not exists subscriptions_expires_at_idx
  on public.subscriptions (expires_at)
  where tier = 'pro' and expires_at is not null;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: own row read" on public.subscriptions;

create policy "subscriptions: own row read"
  on public.subscriptions for select using (auth.uid() = user_id);

-- No insert/update/delete policies for regular users — only service role
-- (RC webhook) writes, so those paths bypass RLS entirely.

-- ──────────────────────────────────────────────────────────────────────────────
-- Idempotency log for RC webhook events. RC delivers each event with a
-- unique `event.id`; we short-circuit any repeat delivery.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.rc_webhook_events (
  event_id text primary key,
  event_type text not null,
  app_user_id text,
  received_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists rc_webhook_events_received_idx
  on public.rc_webhook_events (received_at desc);

alter table public.rc_webhook_events enable row level security;
-- No policies. Service role only. Not exposed to clients ever.

-- ──────────────────────────────────────────────────────────────────────────────
-- Convenience view for anywhere we need "is this user pro right now".
-- Reads from subscriptions; expired-but-not-yet-webhooked rows fall to free.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace view public.v_active_pro as
select
  s.user_id,
  s.tier,
  s.status,
  s.rc_product_id,
  s.expires_at,
  s.will_renew,
  (
    s.tier = 'pro'
    and s.status in ('active','trial','grace')
    and (s.expires_at is null or s.expires_at > now())
  ) as is_pro
from public.subscriptions s;
