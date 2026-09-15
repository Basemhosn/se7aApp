-- SE7A async scan pipeline (2026-09-16).
--
-- Adds status columns to public.scans so plate/menu/body scans can be
-- kicked off, processed in the background, and reconciled after the
-- mobile app is closed or restarted. Push notifications deliver the
-- "your scan is ready" signal; the client can also poll the GET
-- endpoint when it opens.
--
-- Backfill: all existing rows are treated as 'ready' since they were
-- written under the old synchronous flow where a row only existed
-- after the AI completed.

alter table public.scans
  add column if not exists status text not null default 'ready'
    check (status in ('queued', 'processing', 'ready', 'failed'));

alter table public.scans
  add column if not exists error_message text;

alter table public.scans
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists scans_set_updated_at on public.scans;
create trigger scans_set_updated_at
  before update on public.scans
  for each row execute function public.tg_set_updated_at();

-- Index for the "any pending scans for this user?" query on app open.
create index if not exists scans_user_status_idx
  on public.scans (user_id, status)
  where status in ('queued', 'processing');
