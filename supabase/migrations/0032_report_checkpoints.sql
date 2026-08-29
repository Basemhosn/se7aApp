-- SE7A: per-week checkpoint completion tracking for reports.
-- Run after 0031_reports.sql.
--
-- Each report's roadmap has one checkpoint per week (see
-- reportPlanSchema.roadmap.weeks[].checkpoint). Users tap a check
-- circle to mark a week's checkpoint met — that state feeds the
-- following Monday's weekly summary ("You nailed week 3's checkpoint
-- of X, on to week 4") and drives the Home roadmap strip's completed-
-- week indicator.
--
-- One row per (report, week_index). Unique index enforces at most
-- one checkpoint per week per report. Nullable met_at allows a "not
-- met" record if we ever want to persist explicit un-checks distinct
-- from "never checked" — but the current UI just deletes the row on
-- unmark, so met_at is populated when the row exists.

create table if not exists public.report_week_checkpoints (
  id bigserial primary key,
  report_id bigint not null references public.reports on delete cascade,
  week_index int not null check (week_index >= 1 and week_index <= 52),
  met_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists report_week_checkpoints_dedup
  on public.report_week_checkpoints (report_id, week_index);

alter table public.report_week_checkpoints enable row level security;

drop policy if exists "checkpoints: own rows read"   on public.report_week_checkpoints;
drop policy if exists "checkpoints: own rows insert" on public.report_week_checkpoints;
drop policy if exists "checkpoints: own rows delete" on public.report_week_checkpoints;

-- All policies gate on ownership of the parent report row.
create policy "checkpoints: own rows read"
  on public.report_week_checkpoints for select
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id and r.user_id = auth.uid()
    )
  );

create policy "checkpoints: own rows insert"
  on public.report_week_checkpoints for insert
  with check (
    exists (
      select 1 from public.reports r
      where r.id = report_id and r.user_id = auth.uid()
    )
  );

create policy "checkpoints: own rows delete"
  on public.report_week_checkpoints for delete
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id and r.user_id = auth.uid()
    )
  );
