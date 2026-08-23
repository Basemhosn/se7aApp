-- SE7A: micronutrient tracking (sodium, fiber, sugar, saturated fat).
-- Run after 0027_restaurant_memory.sql.
--
-- Sodium + fiber matter most for the Gulf user base — traditional
-- cuisine leans salt-heavy (kabsa, foul, canned goods, processed
-- cheese) and fiber-light (rice + meat, less legume/veg). Sugar +
-- saturated fat come along in the same schema pass since the AI
-- prompts already reason about these internally; adding two more
-- columns each is cheap.
--
-- All ranges — honest brand. Legacy rows + manual entries stay
-- valid because everything is nullable; the client renders "—"
-- for missing values.

alter table public.meal_items
  add column if not exists sodium_mg_low numeric
    check (sodium_mg_low is null or (sodium_mg_low >= 0 and sodium_mg_low <= 20000)),
  add column if not exists sodium_mg_high numeric
    check (sodium_mg_high is null or (sodium_mg_high >= 0 and sodium_mg_high <= 20000)),
  add column if not exists fiber_g_low numeric
    check (fiber_g_low is null or (fiber_g_low >= 0 and fiber_g_low <= 100)),
  add column if not exists fiber_g_high numeric
    check (fiber_g_high is null or (fiber_g_high >= 0 and fiber_g_high <= 100)),
  add column if not exists sugar_g_low numeric
    check (sugar_g_low is null or (sugar_g_low >= 0 and sugar_g_low <= 500)),
  add column if not exists sugar_g_high numeric
    check (sugar_g_high is null or (sugar_g_high >= 0 and sugar_g_high <= 500)),
  add column if not exists saturated_fat_g_low numeric
    check (saturated_fat_g_low is null or (saturated_fat_g_low >= 0 and saturated_fat_g_low <= 300)),
  add column if not exists saturated_fat_g_high numeric
    check (saturated_fat_g_high is null or (saturated_fat_g_high >= 0 and saturated_fat_g_high <= 300));

-- Per-user daily targets. Defaults follow generic WHO / AHA guidance:
--   sodium 2300 mg/day upper limit for healthy adults
--   fiber  25 g/day (women) / 38 g/day (men) — 25 is the safer default
--   sugar  no default (WHO free-sugar <25g; SE7A prompt tracks total,
--          so a shared default would over/under-warn)
--   sat fat no default (varies with kcal target; leaving null lets the
--          coach reason without a hard rule)
--
-- Users can override via /api/profile/prefs.
alter table public.profiles
  add column if not exists daily_sodium_mg int
    check (daily_sodium_mg is null or (daily_sodium_mg > 0 and daily_sodium_mg <= 10000)),
  add column if not exists daily_fiber_g int
    check (daily_fiber_g is null or (daily_fiber_g > 0 and daily_fiber_g <= 100)),
  add column if not exists daily_sugar_g int
    check (daily_sugar_g is null or (daily_sugar_g > 0 and daily_sugar_g <= 300)),
  add column if not exists daily_saturated_fat_g int
    check (daily_saturated_fat_g is null or (daily_saturated_fat_g > 0 and daily_saturated_fat_g <= 150));

-- Backfill sensible defaults for the two we're opinionated about.
update public.profiles
  set daily_sodium_mg = 2300
  where daily_sodium_mg is null;

update public.profiles
  set daily_fiber_g = 25
  where daily_fiber_g is null;
