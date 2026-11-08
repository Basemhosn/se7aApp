-- Onboarding checklist dismissal marker. Replaces the 4-slide tutorial
-- added in migration 0046 (tutorial_seen_at) with a persistent
-- getting-started checklist that lives on Home for new users and
-- auto-checks items based on real app usage. Users can explicitly
-- dismiss the card, which sets this column to now().
--
-- Backfill rule: anyone who already finished onboarding before this
-- migration applied gets marked dismissed automatically — they're not
-- new users and shouldn't suddenly see an activation checklist. Only
-- brand-new signups after this migration will see it.
--
-- Note: tutorial_seen_at from migration 0046 stays in the schema. It's
-- no longer referenced by any client code (mobile routes directly from
-- onboarding to Home now) but removing it is a separate migration to
-- avoid breaking build 95/96 clients that may still be in the field.

alter table public.profiles
  add column if not exists checklist_dismissed_at timestamptz;

update public.profiles
  set checklist_dismissed_at = onboarded_at
  where onboarded_at is not null and checklist_dismissed_at is null;
