-- SE7A allergen + ingredient exclusions (2026-09-21).
--
-- Users need to tell SE7A about food allergies (nut, dairy, shellfish,
-- etc) AND arbitrary ingredients they don't eat (e.g. "no lamb", "no
-- cilantro"). Meal-plan + suggest endpoints read these and hand them
-- to the model so a plan never surfaces a food the user won't eat.
--
-- Two separate columns because they carry different weight: allergies
-- are a hard NO (safety rule), exclusions are a soft NO (preference).
-- Both are text arrays so the client can add/remove without a schema
-- change per entry.

alter table public.profiles
  add column if not exists allergies text[] not null default '{}';

alter table public.profiles
  add column if not exists excluded_ingredients text[] not null default '{}';
