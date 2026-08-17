-- SE7A: weekly meal plans + shopping lists.
-- Run after 0011_referrals.sql. Idempotent where reasonable.
--
-- One plan per user per week (unique on user_id + week_start).
-- Plan structure is stored as jsonb — schema flexibility while we iterate:
-- { days: [{ day_of_week: 0-6, meals: [{ slot, name, portion, kcal_low/high,
--   protein/carb/fat _low/_high, ingredients: [{name, qty}], recipe_id?,
--   logged_meal_item_id? }] }] }

create table if not exists public.meal_plans (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  plan jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists meal_plans_user_week_idx
  on public.meal_plans (user_id, week_start desc);

drop trigger if exists meal_plans_set_updated_at on public.meal_plans;
create trigger meal_plans_set_updated_at
  before update on public.meal_plans
  for each row execute function public.tg_set_updated_at();

alter table public.meal_plans enable row level security;

drop policy if exists "meal_plans: own rows read"   on public.meal_plans;
drop policy if exists "meal_plans: own rows write"  on public.meal_plans;
drop policy if exists "meal_plans: own rows update" on public.meal_plans;
drop policy if exists "meal_plans: own rows delete" on public.meal_plans;

create policy "meal_plans: own rows read"
  on public.meal_plans for select using (auth.uid() = user_id);

create policy "meal_plans: own rows write"
  on public.meal_plans for insert with check (auth.uid() = user_id);

create policy "meal_plans: own rows update"
  on public.meal_plans for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "meal_plans: own rows delete"
  on public.meal_plans for delete using (auth.uid() = user_id);
