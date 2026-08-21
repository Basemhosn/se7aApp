-- SE7A: external integrations (Strava, Whoop, Oura, etc).
-- Run after 0017_cardio.sql.
--
-- Multi-provider by design — the same table backs every OAuth-based
-- integration we add. Tokens live server-side only; RLS scopes reads to
-- the owning user so the mobile app can render a "Connected" state
-- without exposing the raw credentials.
--
-- oauth_states is short-lived (10 min TTL enforced by the callback
-- handler) and used to prevent CSRF on the OAuth redirect.

create table if not exists public.user_integrations (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('strava','whoop','oura','fitbit')),
  provider_user_id text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  primary key (user_id, provider)
);

create index if not exists user_integrations_provider_expires_idx
  on public.user_integrations (provider, expires_at);

alter table public.user_integrations enable row level security;

drop policy if exists "user_integrations: own row read"   on public.user_integrations;
drop policy if exists "user_integrations: own row delete" on public.user_integrations;

-- Users can read their own row (for the Settings "Connected as X" UI)
-- and delete it (disconnect). Only the service role writes — tokens
-- are handled by the OAuth callback + refresh flows on the server.
create policy "user_integrations: own row read"
  on public.user_integrations for select using (auth.uid() = user_id);

create policy "user_integrations: own row delete"
  on public.user_integrations for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- oauth_states: short-lived tokens used to bind the Strava OAuth callback
-- back to the SE7A user who initiated it. Prevents CSRF.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create index if not exists oauth_states_expires_idx
  on public.oauth_states (expires_at);

alter table public.oauth_states enable row level security;
-- No policies. Service role only.

-- ──────────────────────────────────────────────────────────────────────────────
-- Extend cardio_sessions.source to include the new integration values,
-- and add a provider_activity_id column for dedupe on re-import.
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.cardio_sessions
  drop constraint if exists cardio_sessions_source_check;

alter table public.cardio_sessions
  add constraint cardio_sessions_source_check
  check (source in ('manual','healthkit','strava','whoop','oura','fitbit'));

alter table public.cardio_sessions
  add column if not exists provider_activity_id text;

create unique index if not exists cardio_sessions_provider_activity_unique
  on public.cardio_sessions (user_id, source, provider_activity_id)
  where provider_activity_id is not null;
