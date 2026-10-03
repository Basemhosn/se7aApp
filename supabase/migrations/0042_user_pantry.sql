-- Per-user pantry: barcodes the user themselves manually entered
-- when OpenFoodFacts had no entry (common for Gulf-market products
-- like regional dairy brands, bakery items with store barcodes).
--
-- Lookup priority is user_pantry → barcode_products (shared OFF
-- cache) → fetch OFF → 404. A pantry hit short-circuits the OFF
-- fetch for THAT user — they trust their own entry over whatever
-- OFF might eventually add. Other users still get their own flow.
--
-- Macros stored in per-100g form so the review screen's portion
-- scaling works identically to OFF products.

create table if not exists public.user_pantry (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  code text not null check (code ~ '^\d{6,14}$'),
  name text not null check (char_length(name) between 1 and 200),
  brand text check (char_length(brand) between 0 and 120),
  serving_size_g numeric check (serving_size_g > 0 and serving_size_g < 2000),
  kcal_per_100g numeric not null check (kcal_per_100g >= 0 and kcal_per_100g < 1500),
  protein_g_per_100g numeric not null check (protein_g_per_100g >= 0 and protein_g_per_100g <= 100),
  carb_g_per_100g numeric not null check (carb_g_per_100g >= 0 and carb_g_per_100g <= 100),
  fat_g_per_100g numeric not null check (fat_g_per_100g >= 0 and fat_g_per_100g <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upsert target: a user re-entering the same code should replace,
-- not duplicate. Multiple users can have the same code in their
-- own pantries without conflict.
create unique index if not exists user_pantry_user_code_idx
  on public.user_pantry (user_id, code);

alter table public.user_pantry enable row level security;

drop policy if exists "user_pantry: own rows read" on public.user_pantry;
drop policy if exists "user_pantry: own rows insert" on public.user_pantry;
drop policy if exists "user_pantry: own rows update" on public.user_pantry;
drop policy if exists "user_pantry: own rows delete" on public.user_pantry;

create policy "user_pantry: own rows read"
  on public.user_pantry for select
  using (auth.uid() = user_id);

create policy "user_pantry: own rows insert"
  on public.user_pantry for insert
  with check (auth.uid() = user_id);

create policy "user_pantry: own rows update"
  on public.user_pantry for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_pantry: own rows delete"
  on public.user_pantry for delete
  using (auth.uid() = user_id);
