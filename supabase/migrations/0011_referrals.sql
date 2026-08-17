-- SE7A Phase 9: referral system.
-- Run after 0010_widget_token.sql. Idempotent where reasonable.
--
-- Every profile gets a short referral_code (8 hex chars). Shareable link
-- is https://se7a.vercel.app/join/{code}. When someone signs up via that
-- link, their profile.referred_by is set to the referrer's user_id.
-- Rewards are deferred until we have a paid tier — for now, just track.

alter table public.profiles
  add column if not exists referral_code text unique;

alter table public.profiles
  add column if not exists referred_by uuid references auth.users on delete set null;

alter table public.profiles
  add column if not exists referred_at timestamptz;

-- Backfill: give every existing user a code.
update public.profiles
  set referral_code = substring(md5(user_id::text || random()::text) from 1 for 8)
  where referral_code is null;

-- Trigger: auto-assign a code on new profile insert.
create or replace function public.tg_set_referral_code()
returns trigger language plpgsql as $$
begin
  if new.referral_code is null then
    new.referral_code := substring(md5(new.user_id::text || random()::text) from 1 for 8);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_referral_code on public.profiles;
create trigger profiles_set_referral_code
  before insert on public.profiles
  for each row execute function public.tg_set_referral_code();

-- Index for lookup by code (unique already provides one; explicit for clarity).
create index if not exists profiles_referral_code_idx
  on public.profiles (referral_code);

-- Index for counting referrals per user.
create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by)
  where referred_by is not null;
