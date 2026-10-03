-- Capture before/after when a user edits plate/menu scan items prior
-- to saving. Each row is the AI's original estimate alongside the
-- user's final version — training signal for prompt tuning + offline
-- analysis of systematic bias (over-portioning, missed items, etc.).
--
-- We don't need the row to be visible to end users; only the service
-- role reads for analytics, so RLS allows own-row insert but no
-- read/update/delete from the end-user client.

create table if not exists public.scan_corrections (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  scan_id uuid references public.scans on delete set null,
  source text not null check (source in ('plate_scan', 'menu_scan')),
  original_items jsonb not null,
  final_items jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists scan_corrections_created_idx
  on public.scan_corrections (created_at desc);

create index if not exists scan_corrections_user_created_idx
  on public.scan_corrections (user_id, created_at desc);

alter table public.scan_corrections enable row level security;

drop policy if exists "scan_corrections: own rows insert"
  on public.scan_corrections;

create policy "scan_corrections: own rows insert"
  on public.scan_corrections for insert
  with check (auth.uid() = user_id);
