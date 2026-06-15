-- SE7A Phase 2: menu-scan storage bucket.
-- Run after 0002_phase1.sql.  Idempotent.

-- Separate bucket from plate-scans so retention + privacy controls can
-- diverge per kind. Same folder convention: {user_id}/{scan_id}.{ext}.
-- Body-scan photos are intentionally NOT stored — no bucket for them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-scans',
  'menu-scans',
  false,
  10485760,  -- 10 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "menu-scans: own folder read"   on storage.objects;
drop policy if exists "menu-scans: own folder insert" on storage.objects;
drop policy if exists "menu-scans: own folder delete" on storage.objects;

create policy "menu-scans: own folder read"
  on storage.objects for select
  using (
    bucket_id = 'menu-scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "menu-scans: own folder insert"
  on storage.objects for insert
  with check (
    bucket_id = 'menu-scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "menu-scans: own folder delete"
  on storage.objects for delete
  using (
    bucket_id = 'menu-scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
