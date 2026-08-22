-- SE7A: allow "health_connect" as a source on cardio + sleep tables.
-- Run after 0024_cycle.sql.
--
-- Android's Health Connect is the counterpart to Apple HealthKit;
-- the mobile app now imports workouts + sleep from Health Connect on
-- Android devices. Data flows identically to HealthKit imports.

alter table public.cardio_sessions
  drop constraint if exists cardio_sessions_source_check;

alter table public.cardio_sessions
  add constraint cardio_sessions_source_check
  check (source in ('manual','healthkit','health_connect','strava','whoop','oura','fitbit'));

alter table public.sleep_sessions
  drop constraint if exists sleep_sessions_source_check;

alter table public.sleep_sessions
  add constraint sleep_sessions_source_check
  check (source in ('whoop','oura','healthkit','health_connect','manual'));
