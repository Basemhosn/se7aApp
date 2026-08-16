-- SE7A Phase 4 (part 1): water intake tracking.
-- Run after 0006_workouts.sql. Idempotent where reasonable.
--
-- Calendar view + manual meal entry require no new tables — they read from
-- existing meal_items / workout_sessions / weight_logs / water_logs. Manual
-- entries use meal_items with source='manual' (already supported in schema).

create table if not exists public.water_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  ml int not null check (ml > 0 and ml <= 5000),
  logged_at timestamptz not null default now()
);

create index if not exists water_logs_user_logged_idx
  on public.water_logs (user_id, logged_at desc);

alter table public.water_logs enable row level security;

drop policy if exists "water_logs: own rows read"   on public.water_logs;
drop policy if exists "water_logs: own rows insert" on public.water_logs;
drop policy if exists "water_logs: own rows delete" on public.water_logs;

create policy "water_logs: own rows read"
  on public.water_logs for select using (auth.uid() = user_id);

create policy "water_logs: own rows insert"
  on public.water_logs for insert with check (auth.uid() = user_id);

create policy "water_logs: own rows delete"
  on public.water_logs for delete using (auth.uid() = user_id);
