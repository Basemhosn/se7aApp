-- SE7A: user-initiated account deletion.
-- Called by /api/account/delete on behalf of the authenticated user.
-- Deleting the auth.users row cascades through profiles, weight_logs,
-- scans, meal_items (all FK on delete cascade). Storage objects are
-- purged by the API route before this call.

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;
