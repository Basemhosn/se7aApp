-- SE7A: per-restaurant meal memory.
-- Run after 0026_recovery.sql.
--
-- Tag each meal_item with the restaurant it came from (nullable, so
-- home meals + manual logs stay untouched). On a return visit the
-- menu scan flow queries this to surface "you liked X last time"
-- above the AI's ranking, matching restaurant name case-insensitively.
--
-- Kept as a plain text column with a case-insensitive index rather
-- than a normalized restaurants table — the AI's restaurant_guess
-- is fuzzy ("Al Baik" vs "AlBaik" vs "Al Baik Restaurant"); a
-- normalization table would just push that fuzziness one layer
-- earlier without solving it. Lowercase-index lookup is good
-- enough for MVP and lets users edit the name freely without
-- foreign-key ceremony.

alter table public.meal_items
  add column if not exists restaurant_name text
    check (restaurant_name is null or char_length(restaurant_name) <= 140);

-- Lookup index: lowercased name per user, matches the query pattern
-- in /api/restaurants/dishes (equality on lower(restaurant_name)).
create index if not exists meal_items_restaurant_lower_idx
  on public.meal_items (user_id, lower(restaurant_name))
  where restaurant_name is not null;
