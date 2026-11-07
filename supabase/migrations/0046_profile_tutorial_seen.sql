-- First-run tutorial marker. Mobile build 95+ routes users whose
-- tutorial_seen_at is null through /tutorial after onboarding, then
-- writes now() when they finish or skip. Null = still needs to see it.
--
-- Backfill: every existing profile that already finished onboarding
-- gets marked as seen so current TestFlight testers don't suddenly see
-- a tutorial on their next app open. Only brand-new signups after this
-- migration applies will have null and therefore see the screen.

alter table public.profiles
  add column if not exists tutorial_seen_at timestamptz;

update public.profiles
  set tutorial_seen_at = onboarded_at
  where onboarded_at is not null and tutorial_seen_at is null;
