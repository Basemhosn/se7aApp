-- SE7A Phase 6: push notification tokens.
-- Run after 0008_chat_fasting_cycling.sql. Idempotent where reasonable.
--
-- Devices register their Expo push token here. We keep one row per
-- (user, token) — a user can have multiple devices, and re-registering
-- from the same device just updates last_seen.

create table if not exists public.push_tokens (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  expo_token text not null,
  platform text not null check (platform in ('ios','android')),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, expo_token)
);

create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens: own rows read"   on public.push_tokens;
drop policy if exists "push_tokens: own rows write"  on public.push_tokens;
drop policy if exists "push_tokens: own rows delete" on public.push_tokens;

create policy "push_tokens: own rows read"
  on public.push_tokens for select using (auth.uid() = user_id);

create policy "push_tokens: own rows write"
  on public.push_tokens for insert with check (auth.uid() = user_id);

create policy "push_tokens: own rows delete"
  on public.push_tokens for delete using (auth.uid() = user_id);
