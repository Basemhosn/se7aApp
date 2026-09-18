-- SE7A referral rewards, symmetric (2026-09-19).
--
-- v1 (0036) only granted the REFERRER a month when a referred user
-- first purchased Pro. This made the "share and both benefit" copy
-- dishonest. v2 grants BOTH parties a month via two rows per referral
-- pair, distinguished by a `role` column:
--
--   role='referrer' → referrer_user_id is beneficiary of the promo
--   role='referred' → referred_user_id is beneficiary of the promo
--
-- Uniqueness moves to (referrer, referred, role) so both rows coexist
-- but each role fires exactly once per pair, ever.
--
-- Backfill: existing rows are all role='referrer' (that was the only
-- mode). No data loss.

alter table public.referral_rewards
  add column if not exists role text not null default 'referrer'
    check (role in ('referrer', 'referred'));

-- Drop the old (referrer, referred) unique, add (referrer, referred, role).
-- Postgres autogenerates unique-constraint names; we hardcode the old
-- one based on the standard naming pattern with a fallback in a DO
-- block to survive prior manual renames.
do $$
declare
  cn text;
begin
  select conname into cn
  from pg_constraint
  where conrelid = 'public.referral_rewards'::regclass
    and contype = 'u'
    and conname like '%referrer_user_id%referred_user_id%';
  if cn is not null then
    execute format('alter table public.referral_rewards drop constraint %I', cn);
  end if;
end
$$;

alter table public.referral_rewards
  add constraint referral_rewards_pair_role_unique
    unique (referrer_user_id, referred_user_id, role);
