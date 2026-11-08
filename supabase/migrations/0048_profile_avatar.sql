-- Profile avatar / display picture support.
-- Stores the storage path (not the URL) on profiles.avatar_url so the
-- mobile client fetches a fresh signed URL per render. Avatars live in
-- the private `profile-pics` bucket, scoped per user via RLS on the
-- first folder segment of the object name (same pattern as plate-scans).

alter table public.profiles
  add column if not exists avatar_url text;

-- Private bucket: 2 MB cap, photo mime types only. Public = false so
-- images don't leak via raw URL; the client always goes through a
-- time-limited signed URL from createSignedUrl().
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-pics',
  'profile-pics',
  false,
  2097152,  -- 2 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile-pics: own folder read"   on storage.objects;
drop policy if exists "profile-pics: own folder insert" on storage.objects;
drop policy if exists "profile-pics: own folder update" on storage.objects;
drop policy if exists "profile-pics: own folder delete" on storage.objects;

create policy "profile-pics: own folder read"
  on storage.objects for select
  using (
    bucket_id = 'profile-pics'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "profile-pics: own folder insert"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-pics'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Update policy lets the user overwrite their own avatar in-place with
-- the same filename (avatar.jpg). Without this, upload with upsert:true
-- fails because the object already exists.
create policy "profile-pics: own folder update"
  on storage.objects for update
  using (
    bucket_id = 'profile-pics'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "profile-pics: own folder delete"
  on storage.objects for delete
  using (
    bucket_id = 'profile-pics'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
