-- SE7A: user-owned progress photo timeline + body measurements.
-- Run after 0013_barcode_cache.sql.
--
-- Privacy: progress photos are DISTINCT from AI body-scan photos.
-- Body-scan images are analyzed in-memory and never stored. These
-- progress photos are explicitly user-saved for their own timeline
-- comparison — private bucket, signed-URL access only, user deletable.
-- The privacy policy at /privacy was revised (2026-08-17) to reflect
-- this split before this migration was written.

-- ──────────────────────────────────────────────────────────────────────────────
-- progress_photos: one row per saved timeline photo.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.progress_photos (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  taken_at timestamptz not null default now(),
  angle text not null check (angle in ('front','side','back')),
  photo_path text not null,                    -- storage path: {user_id}/{id}.{ext}
  weight_kg_snapshot numeric,                  -- attached from weight_logs if fresh
  notes text
);

create index if not exists progress_photos_user_taken_idx
  on public.progress_photos (user_id, taken_at desc);

create index if not exists progress_photos_user_angle_idx
  on public.progress_photos (user_id, angle, taken_at desc);

alter table public.progress_photos enable row level security;

drop policy if exists "progress_photos: own rows read"   on public.progress_photos;
drop policy if exists "progress_photos: own rows insert" on public.progress_photos;
drop policy if exists "progress_photos: own rows delete" on public.progress_photos;

create policy "progress_photos: own rows read"
  on public.progress_photos for select using (auth.uid() = user_id);

create policy "progress_photos: own rows insert"
  on public.progress_photos for insert with check (auth.uid() = user_id);

create policy "progress_photos: own rows delete"
  on public.progress_photos for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- body_measurements: user-entered tape-measure values.
-- All in cm. Every column nullable so users log only what they track.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.body_measurements (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  taken_at timestamptz not null default now(),
  waist_cm numeric,
  hip_cm numeric,
  chest_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  neck_cm numeric,
  notes text
);

create index if not exists body_measurements_user_taken_idx
  on public.body_measurements (user_id, taken_at desc);

alter table public.body_measurements enable row level security;

drop policy if exists "body_measurements: own rows read"   on public.body_measurements;
drop policy if exists "body_measurements: own rows insert" on public.body_measurements;
drop policy if exists "body_measurements: own rows update" on public.body_measurements;
drop policy if exists "body_measurements: own rows delete" on public.body_measurements;

create policy "body_measurements: own rows read"
  on public.body_measurements for select using (auth.uid() = user_id);

create policy "body_measurements: own rows insert"
  on public.body_measurements for insert with check (auth.uid() = user_id);

create policy "body_measurements: own rows update"
  on public.body_measurements for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "body_measurements: own rows delete"
  on public.body_measurements for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Storage bucket for progress photos. Private. Path shape enforced by RLS:
-- {user_id}/{filename} — first folder segment must match auth.uid()::text.
-- ──────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  15728640,  -- 15 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "progress-photos: own folder read"   on storage.objects;
drop policy if exists "progress-photos: own folder insert" on storage.objects;
drop policy if exists "progress-photos: own folder delete" on storage.objects;

create policy "progress-photos: own folder read"
  on storage.objects for select
  using (
    bucket_id = 'progress-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "progress-photos: own folder insert"
  on storage.objects for insert
  with check (
    bucket_id = 'progress-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "progress-photos: own folder delete"
  on storage.objects for delete
  using (
    bucket_id = 'progress-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
