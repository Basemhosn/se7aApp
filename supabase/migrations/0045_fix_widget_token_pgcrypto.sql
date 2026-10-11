-- The widget_token trigger calls gen_random_bytes() from pgcrypto. Supabase
-- stores extensions in the `extensions` schema, not `public`, so the
-- unqualified call fails with "function gen_random_bytes(integer) does
-- not exist" and blocks every new signup (handle_new_user → insert into
-- profiles → tg_set_widget_token → ERROR).
--
-- Fix: qualify the function call. Also pin search_path so the function
-- can find pgcrypto regardless of session search_path.
create or replace function public.tg_set_widget_token()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.widget_token is null then
    new.widget_token := encode(extensions.gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;
