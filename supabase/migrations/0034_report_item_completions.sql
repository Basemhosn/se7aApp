-- SE7A 90-Day Plan interactivity (PR2, 2026-09-02).
-- Generic key-value completion store for anything the user can check
-- off or log a value against inside the report — habit ticks, grocery
-- items, benchmark test results, "session done" flags. One table
-- keeps the schema flexible while we iterate on which items are
-- interactive.
--
-- Key naming convention (client + server must agree):
--   habit:{phase}:{index}:{yyyy-mm-dd}    → daily habit checkbox
--   sleep:{phase}:{index}:{yyyy-mm-dd}    → daily sleep-recovery rule
--   grocery:{index}                       → persistent grocery checkbox
--   benchmark:{week}:{slug}               → benchmark test log (value_json)
--   session:{phase}:{day_index}:{yyyy-mm-dd}   → workout session done
--
-- `value_json` is optional. For pure checkboxes it stays null and
-- presence of the row (with done_at set) indicates "done". For
-- benchmarks it stores {result, unit, notes, logged_at}.

create table if not exists public.report_item_completions (
  user_id uuid not null references auth.users on delete cascade,
  report_id bigint not null references public.reports(id) on delete cascade,
  item_key text not null,
  done_at timestamptz,
  value_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, report_id, item_key)
);

create index if not exists report_item_completions_report_idx
  on public.report_item_completions (report_id);

drop trigger if exists report_item_completions_set_updated_at on public.report_item_completions;
create trigger report_item_completions_set_updated_at
  before update on public.report_item_completions
  for each row execute function public.tg_set_updated_at();

alter table public.report_item_completions enable row level security;

drop policy if exists "report_item_completions: own rows read"   on public.report_item_completions;
drop policy if exists "report_item_completions: own rows insert" on public.report_item_completions;
drop policy if exists "report_item_completions: own rows update" on public.report_item_completions;
drop policy if exists "report_item_completions: own rows delete" on public.report_item_completions;

create policy "report_item_completions: own rows read"
  on public.report_item_completions for select
  using (auth.uid() = user_id);

create policy "report_item_completions: own rows insert"
  on public.report_item_completions for insert
  with check (auth.uid() = user_id);

create policy "report_item_completions: own rows update"
  on public.report_item_completions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "report_item_completions: own rows delete"
  on public.report_item_completions for delete
  using (auth.uid() = user_id);
