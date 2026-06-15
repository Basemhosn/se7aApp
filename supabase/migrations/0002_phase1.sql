-- SE7A Phase 1: plate-scan persistence + daily ledger.
-- Run after 0001_phase0.sql.  Idempotent where reasonable.

-- ──────────────────────────────────────────────────────────────────────────────
-- scans: every AI vision call (plate, menu later, body later).
-- Image stays in Supabase Storage under plate-scans/{user_id}/{id}.{ext}.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('plate','menu','body')),
  image_path text,
  model text,
  prompt_version text,
  raw_response jsonb,
  parsed jsonb,
  latency_ms int,
  cost_usd numeric,
  created_at timestamptz not null default now()
);

create index if not exists scans_user_created_idx
  on public.scans (user_id, created_at desc);

alter table public.scans enable row level security;

drop policy if exists "scans: own rows read"   on public.scans;
drop policy if exists "scans: own rows insert" on public.scans;
drop policy if exists "scans: own rows delete" on public.scans;

create policy "scans: own rows read"
  on public.scans for select
  using (auth.uid() = user_id);

create policy "scans: own rows insert"
  on public.scans for insert
  with check (auth.uid() = user_id);

create policy "scans: own rows delete"
  on public.scans for delete
  using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- meal_items: the daily ledger.  Source-of-truth for "calories eaten today".
-- All macros are ranges, per the SE7A "no fake precision" brand rule.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.meal_items (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  scan_id uuid references public.scans on delete set null,
  source text not null check (source in
    ('plate_scan','menu_scan','manual','barcode')),
  eaten_at timestamptz not null default now(),
  meal_slot text check (meal_slot in ('breakfast','lunch','dinner','snack')),
  name text not null,
  portion_estimate text,
  kcal_low int    not null check (kcal_low    >= 0),
  kcal_high int   not null check (kcal_high   >= kcal_low),
  protein_g_low  numeric not null check (protein_g_low  >= 0),
  protein_g_high numeric not null check (protein_g_high >= protein_g_low),
  carb_g_low  numeric not null check (carb_g_low  >= 0),
  carb_g_high numeric not null check (carb_g_high >= carb_g_low),
  fat_g_low  numeric not null check (fat_g_low  >= 0),
  fat_g_high numeric not null check (fat_g_high >= fat_g_low),
  confidence text check (confidence in ('low','medium','high'))
);

create index if not exists meal_items_user_eaten_at_idx
  on public.meal_items (user_id, eaten_at desc);

alter table public.meal_items enable row level security;

drop policy if exists "meal_items: own rows read"   on public.meal_items;
drop policy if exists "meal_items: own rows insert" on public.meal_items;
drop policy if exists "meal_items: own rows update" on public.meal_items;
drop policy if exists "meal_items: own rows delete" on public.meal_items;

create policy "meal_items: own rows read"
  on public.meal_items for select
  using (auth.uid() = user_id);

create policy "meal_items: own rows insert"
  on public.meal_items for insert
  with check (auth.uid() = user_id);

create policy "meal_items: own rows update"
  on public.meal_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "meal_items: own rows delete"
  on public.meal_items for delete
  using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Storage bucket for plate photos.  Private.  Files are namespaced by user_id
-- so RLS can constrain access by the first folder segment of the object key.
-- Body-scan photos are intentionally NOT stored (privacy policy commitment).
-- ──────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plate-scans',
  'plate-scans',
  false,
  10485760,  -- 10 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "plate-scans: own folder read"   on storage.objects;
drop policy if exists "plate-scans: own folder insert" on storage.objects;
drop policy if exists "plate-scans: own folder delete" on storage.objects;

create policy "plate-scans: own folder read"
  on storage.objects for select
  using (
    bucket_id = 'plate-scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "plate-scans: own folder insert"
  on storage.objects for insert
  with check (
    bucket_id = 'plate-scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "plate-scans: own folder delete"
  on storage.objects for delete
  using (
    bucket_id = 'plate-scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
