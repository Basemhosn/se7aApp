-- SE7A: daily recovery / readiness scores.
-- Run after 0025_health_connect.sql.
--
-- Both Whoop (recovery_score) and Oura (daily_readiness.score) expose
-- a normalized 0-100 composite that biases how hard a user should
-- train today. Stored per-day per-source; the coach reads the most
-- recent value and a 7-day rolling average to advise deload vs push.
--
-- Band buckets match Whoop's own colors (green >=67, yellow 34-66,
-- red <34) so we can render consistently across sources.

create table if not exists public.recovery_scores (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  source text not null check (source in ('whoop','oura','healthkit','health_connect','manual')),
  day date not null,
  score int not null check (score >= 0 and score <= 100),
  band text check (band is null or band in ('poor','compromised','primed')),
  hrv_ms numeric check (hrv_ms is null or (hrv_ms >= 0 and hrv_ms <= 500)),
  resting_hr_bpm int check (resting_hr_bpm is null or (resting_hr_bpm >= 20 and resting_hr_bpm <= 200)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per (user, source, day) — repeat syncs from the same source
-- upsert cleanly. Cross-source (Whoop + Oura) intentionally stays as
-- separate rows so we can show either one or pick the most-trusted.
create unique index if not exists recovery_scores_dedup
  on public.recovery_scores (user_id, source, day);

create index if not exists recovery_scores_user_day_idx
  on public.recovery_scores (user_id, day desc);

alter table public.recovery_scores enable row level security;

drop policy if exists "recovery_scores: own rows read"   on public.recovery_scores;
drop policy if exists "recovery_scores: own rows insert" on public.recovery_scores;
drop policy if exists "recovery_scores: own rows update" on public.recovery_scores;
drop policy if exists "recovery_scores: own rows delete" on public.recovery_scores;

create policy "recovery_scores: own rows read"
  on public.recovery_scores for select using (auth.uid() = user_id);

create policy "recovery_scores: own rows insert"
  on public.recovery_scores for insert with check (auth.uid() = user_id);

create policy "recovery_scores: own rows update"
  on public.recovery_scores for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "recovery_scores: own rows delete"
  on public.recovery_scores for delete using (auth.uid() = user_id);
