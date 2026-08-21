-- SE7A: Ramadan mode preferences.
-- Run after 0018_integrations.sql.
--
-- Ramadan dates auto-detect from a client + server library that
-- hardcodes ~10 years of dates. This column just captures user
-- overrides — enable/disable + fajr/maghrib times + notification
-- preferences. Times default to Dubai (~UAE) which is a reasonable
-- Gulf baseline; users pick their own city times in Settings.

alter table public.profiles
  add column if not exists ramadan_prefs jsonb
    default jsonb_build_object(
      'auto_detect', true,
      'enabled_override', null,
      'fajr_time', '04:30',
      'maghrib_time', '18:45',
      'suhoor_reminder', true,
      'iftar_reminder', true
    );

-- Backfill any pre-existing rows that were null.
update public.profiles
  set ramadan_prefs = jsonb_build_object(
    'auto_detect', true,
    'enabled_override', null,
    'fajr_time', '04:30',
    'maghrib_time', '18:45',
    'suhoor_reminder', true,
    'iftar_reminder', true
  )
  where ramadan_prefs is null;
