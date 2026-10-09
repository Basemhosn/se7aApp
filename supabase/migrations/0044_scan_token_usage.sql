-- SE7A: log token usage per AI scan so cost per endpoint is queryable.
--
-- Prior to this, scans table had cost_usd but no breakdown — making it
-- impossible to tell "is plate scan or meal plan burning more tokens"
-- without going to the Anthropic dashboard (which doesn't attribute per
-- endpoint). tokens_in / tokens_out mirrors chat_messages' existing
-- columns so a cross-table cost rollup can treat them uniformly.
--
-- All columns nullable — legacy rows + non-AI scans leave them NULL.
-- The write path logs usage.inputTokens / usage.outputTokens from the
-- AI SDK result. Cost formula lives in a view (future) rather than
-- hard-coded here so provider price changes don't require a backfill.

alter table public.scans
  add column if not exists tokens_in int,
  add column if not exists tokens_out int;

create index if not exists scans_tokens_created_idx
  on public.scans (created_at desc)
  where tokens_in is not null;

-- Same for meal_plans. Weekly plan generation is one of the two most
-- expensive endpoints (vision scan being the other); worth tracking.
alter table public.meal_plans
  add column if not exists tokens_in int,
  add column if not exists tokens_out int;
