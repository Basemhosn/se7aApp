-- SE7A: deduplicate waitlist and enforce one row per email (case-insensitive).
-- Safe to re-run.

-- 1. Collapse any existing duplicates, keeping the earliest signup per email.
--    Uses created_at when present; falls back to ctid otherwise.
do $$
declare
  has_created_at boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'waitlist'
      and column_name = 'created_at'
  ) into has_created_at;

  if has_created_at then
    delete from public.waitlist w
    using (
      select ctid,
             row_number() over (
               partition by lower(email)
               order by created_at, ctid
             ) as rn
      from public.waitlist
    ) dups
    where w.ctid = dups.ctid and dups.rn > 1;
  else
    delete from public.waitlist w
    using (
      select ctid,
             row_number() over (
               partition by lower(email)
               order by ctid
             ) as rn
      from public.waitlist
    ) dups
    where w.ctid = dups.ctid and dups.rn > 1;
  end if;
end$$;

-- 2. One row per email, case-insensitive. Functional unique index doubles
--    as the constraint Postgres returns 23505 on, which the client uses
--    to render "you're already on the list".
create unique index if not exists waitlist_email_lower_uniq
  on public.waitlist (lower(email));

-- 3. Anonymous inserts are how the landing page signs people up. The
--    earlier migration enabled RLS without adding an insert policy, which
--    silently blocks the form on fresh projects.
alter table public.waitlist enable row level security;

drop policy if exists "waitlist: anon insert" on public.waitlist;
create policy "waitlist: anon insert"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);
