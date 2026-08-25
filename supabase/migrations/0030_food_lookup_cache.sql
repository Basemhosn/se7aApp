-- SE7A: cache for AI-backed food macro lookups.
-- Run after 0029_meal_items_voice_source.sql.
--
-- Backs /api/food/lookup — user types "chicken breast 200g" or
-- "al baik chicken meal" and we return honest macro ranges. First
-- lookup hits Claude; subsequent lookups of the same normalized
-- query are ~10ms table scans instead of ~1s LLM calls.
--
-- Cache key is the normalized query (lowercased + whitespace-collapsed)
-- so "Chicken Breast", "chicken   breast", and "chicken breast" all
-- hit the same row. Not user-scoped — this is a shared corpus of
-- deterministic food data every user benefits from.
--
-- The full LLM response (up to 3 item variants + notes) is stored
-- as jsonb because the response shape can evolve; one row per query,
-- not one row per item.

create table if not exists public.food_lookup_cache (
  id bigserial primary key,
  query_normalized text not null unique,
  query_original text not null,
  response jsonb not null,
  hit_count int not null default 1,
  last_hit_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists food_lookup_cache_hit_count_idx
  on public.food_lookup_cache (hit_count desc, last_hit_at desc);

alter table public.food_lookup_cache enable row level security;

-- Reads go through the service role (from the API route) so no
-- policy is required for select; keep the policy off. Writes never
-- happen from the client.
