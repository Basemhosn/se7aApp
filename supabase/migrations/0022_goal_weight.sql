-- SE7A: optional target weight for the projection chart.
-- Run after 0021_streak_freezes.sql.
--
-- The profile already stores `goal` (cut/recomp/maintain/bulk) and
-- `goal_rate_kg_per_week`, i.e. a direction + rate. A projection chart
-- needs an absolute target too — otherwise the "on pace to hit X by Y"
-- readout has no anchor. This column is optional: when null, the chart
-- shows a rolling forward projection with no goal line.

alter table public.profiles
  add column if not exists goal_weight_kg numeric
    check (goal_weight_kg is null or (goal_weight_kg > 0 and goal_weight_kg < 500));
