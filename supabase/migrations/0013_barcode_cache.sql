-- SE7A: Open Food Facts lookup cache.
-- Products don't change often; cache each successful lookup so users
-- who scan the same barcode twice (or the same product across users)
-- don't re-hit OFF. Anyone can read (public catalog), only the service
-- role writes (via the /api/barcode/lookup route).

create table if not exists public.barcode_products (
  code text primary key,
  name text not null,
  brand text,
  image_url text,
  serving_size_g int,
  kcal_per_100g numeric not null,
  protein_g_per_100g numeric not null,
  carb_g_per_100g numeric not null,
  fat_g_per_100g numeric not null,
  confidence text not null check (confidence in ('low','medium','high')),
  source text not null default 'off',
  fetched_at timestamptz not null default now()
);

create index if not exists barcode_products_fetched_at_idx
  on public.barcode_products (fetched_at desc);

alter table public.barcode_products enable row level security;

drop policy if exists "barcode_products: public read" on public.barcode_products;
drop policy if exists "barcode_products: authed write" on public.barcode_products;
drop policy if exists "barcode_products: authed update" on public.barcode_products;

-- Any signed-in user can read the cache.
create policy "barcode_products: public read"
  on public.barcode_products for select
  using (auth.uid() is not null);

-- Any signed-in user can seed the cache from their scan (upsert path).
create policy "barcode_products: authed write"
  on public.barcode_products for insert
  with check (auth.uid() is not null);

create policy "barcode_products: authed update"
  on public.barcode_products for update
  using (auth.uid() is not null) with check (auth.uid() is not null);
