-- SE7A referral reward ledger (2026-09-14).
--
-- When a referred user upgrades to Pro (RC INITIAL_PURCHASE for a known
-- Pro product), the RC webhook grants the referrer a promotional
-- entitlement via RC's REST API. One row per (referrer, referred) pair
-- via the unique constraint — prevents double-granting on cancel+re-sub
-- races or duplicate webhook deliveries.
--
-- Delivery is deliberately RC-side (promotional entitlement) rather
-- than direct subscriptions.expires_at manipulation: RC stays source
-- of truth, existing entitlement flow works unchanged, later real
-- purchases don't conflict with our writes.

create table if not exists public.referral_rewards (
  id bigserial primary key,
  referrer_user_id uuid not null references auth.users on delete cascade,
  referred_user_id uuid not null references auth.users on delete cascade,
  granted_at timestamptz not null default now(),
  days_granted int not null default 30,
  applied_at timestamptz,
  applied_via text,          -- 'rc_promo_grant' | 'manual' | null (pending)
  applied_error text,        -- last error if applied_at is still null
  unique (referrer_user_id, referred_user_id)
);

create index if not exists referral_rewards_referrer_idx
  on public.referral_rewards (referrer_user_id, granted_at desc);

create index if not exists referral_rewards_pending_idx
  on public.referral_rewards (granted_at)
  where applied_at is null;

alter table public.referral_rewards enable row level security;

drop policy if exists "referral_rewards: own rows read" on public.referral_rewards;

create policy "referral_rewards: own rows read"
  on public.referral_rewards for select
  using (auth.uid() = referrer_user_id);

-- No user-side write policies. Service role (RC webhook + admin retry)
-- is the only writer.
