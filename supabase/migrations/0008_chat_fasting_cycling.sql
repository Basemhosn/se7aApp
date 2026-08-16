-- SE7A Phase 5: coach chat + intermittent fasting + calorie cycling.
-- Run after 0007_water_calendar.sql. Idempotent where reasonable.

-- ──────────────────────────────────────────────────────────────────────────────
-- chat_messages: one row per turn in the AI coach conversation. We keep the
-- full history so we can send a rolling context window to Claude and the user
-- can scroll their history.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  tokens_in int,
  tokens_out int,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages: own rows read"   on public.chat_messages;
drop policy if exists "chat_messages: own rows insert" on public.chat_messages;
drop policy if exists "chat_messages: own rows delete" on public.chat_messages;

create policy "chat_messages: own rows read"
  on public.chat_messages for select using (auth.uid() = user_id);

create policy "chat_messages: own rows insert"
  on public.chat_messages for insert with check (auth.uid() = user_id);

create policy "chat_messages: own rows delete"
  on public.chat_messages for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- fasting_windows: user starts a fast, later ends it. ended_at null while
-- the fast is active. Only one active fast per user at a time (enforced by
-- a unique partial index).
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.fasting_windows (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  target_hours numeric not null check (target_hours between 1 and 72),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists fasting_windows_one_active_idx
  on public.fasting_windows (user_id) where ended_at is null;

create index if not exists fasting_windows_user_started_idx
  on public.fasting_windows (user_id, started_at desc);

alter table public.fasting_windows enable row level security;

drop policy if exists "fasting_windows: own rows read"   on public.fasting_windows;
drop policy if exists "fasting_windows: own rows insert" on public.fasting_windows;
drop policy if exists "fasting_windows: own rows update" on public.fasting_windows;
drop policy if exists "fasting_windows: own rows delete" on public.fasting_windows;

create policy "fasting_windows: own rows read"
  on public.fasting_windows for select using (auth.uid() = user_id);

create policy "fasting_windows: own rows insert"
  on public.fasting_windows for insert with check (auth.uid() = user_id);

create policy "fasting_windows: own rows update"
  on public.fasting_windows for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "fasting_windows: own rows delete"
  on public.fasting_windows for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Calorie cycling: on rest days apply this delta to daily_kcal_target.
-- Negative for cutting patterns (e.g. -300 kcal on rest days), positive is
-- unusual but allowed. Zero = no cycling (default).
-- The dashboard computes today's adjusted target based on whether today has a
-- workout logged.
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists rest_day_kcal_delta int not null default 0
    check (rest_day_kcal_delta between -1000 and 1000);
