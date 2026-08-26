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
-- RLS mirrors barcode_products (0013): any authenticated user can
-- read + insert. Route-level rate limits (20/min, 200/day per user)
-- bound abuse; the endpoint calls this via a user-scoped route
-- client, so no service role key is needed in production.

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

drop policy if exists "food_lookup_cache: authed read"   on public.food_lookup_cache;
drop policy if exists "food_lookup_cache: authed insert" on public.food_lookup_cache;
drop policy if exists "food_lookup_cache: authed update" on public.food_lookup_cache;

create policy "food_lookup_cache: authed read"
  on public.food_lookup_cache for select
  using (auth.uid() is not null);

create policy "food_lookup_cache: authed insert"
  on public.food_lookup_cache for insert
  with check (auth.uid() is not null);

-- Updates cover the hit_count / last_hit_at bump after a cache hit.
create policy "food_lookup_cache: authed update"
  on public.food_lookup_cache for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
