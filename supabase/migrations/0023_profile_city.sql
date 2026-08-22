-- SE7A: user city + country for prayer time auto-detection.
-- Run after 0022_goal_weight.sql.
--
-- Powers automatic fajr/maghrib times during Ramadan via the Aladhan
-- API (aladhan.com). Both columns are free-text and optional — when
-- either is null the client falls back to the manual times stored in
-- ramadan_prefs. Country stored as a free-form English name (e.g.
-- "United Arab Emirates") to match Aladhan's expected input.

alter table public.profiles
  add column if not exists city text,
  add column if not exists country text;
