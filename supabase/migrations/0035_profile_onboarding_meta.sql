-- SE7A onboarding v2 (2026-09-02).
-- Adds a jsonb column to profiles for one-off onboarding metadata
-- collected during the redesigned flow (attribution source, halal
-- acknowledgement flag, ramadan mode opt-in choice, etc.).
--
-- Using jsonb instead of one column per field so we can iterate on
-- what we collect without a migration each time. Nothing here is
-- load-bearing for downstream logic — the daily targets + macros
-- still come from the explicit typed columns.

alter table public.profiles
  add column if not exists onboarding_meta jsonb not null default '{}'::jsonb;
