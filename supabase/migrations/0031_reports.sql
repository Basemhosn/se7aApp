-- SE7A: personalized 90-day transformation reports.
-- Run after 0030_food_lookup_cache.sql.
--
-- Backs the "SE7A 90-Day Plan" — a one-shot AI-generated blueprint
-- (targets, meal plan, workouts, habits, tracking rules, week-by-week
-- roadmap, weekly summary) purchased once for 19 AED (consumable IAP)
-- or included with Pro. Users may buy multiple over time; each row is
-- one plan generated at a specific date. The most recent still-active
-- plan is what the /report screen renders.
--
-- The plan is stored as jsonb because the schema (see
-- lib/schemas/report.ts) has ~8 nested sections and will evolve; a
-- typed relational layout would make every schema tweak a migration.
-- Weekly_summary is a separate jsonb column so we can update just it
-- without rewriting the whole plan when the weekly-refresh endpoint
-- regenerates the "how you're doing" section from fresh ledger data.

create table if not exists public.reports (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  generated_at timestamptz not null default now(),
  -- Full 90-day plan payload (all sections except weekly_summary).
  plan jsonb not null,
  -- Regenerated weekly from real ledger + weight logs. Nullable —
  -- fresh reports don't have a summary until the first Monday check-in.
  weekly_summary jsonb,
  weekly_summary_at timestamptz,
  -- Cache key for how many days into the plan we are, computed
  -- client-side but pinned here so the "Week X of 12" label doesn't
  -- drift if the user's clock skews.
  duration_days int not null default 90 check (duration_days > 0 and duration_days <= 365),
  updated_at timestamptz not null default now()
);

create index if not exists reports_user_generated_idx
  on public.reports (user_id, generated_at desc);

alter table public.reports enable row level security;

drop policy if exists "reports: own rows read"   on public.reports;
drop policy if exists "reports: own rows insert" on public.reports;
drop policy if exists "reports: own rows update" on public.reports;

create policy "reports: own rows read"
  on public.reports for select
  using (auth.uid() = user_id);

create policy "reports: own rows insert"
  on public.reports for insert
  with check (auth.uid() = user_id);

create policy "reports: own rows update"
  on public.reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
