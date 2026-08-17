-- SE7A Phase 8: widget token for the iOS home-screen widget.
-- Run after 0009_push_notifications.sql. Idempotent where reasonable.
--
-- The widget fetches remaining kcal via a token-authed endpoint rather
-- than the user's session (widgets can't hold JWTs easily). Token is
-- unique per user, revocable, and only grants read access to a small
-- set of daily stats — never PII or writes.

alter table public.profiles
  add column if not exists widget_token text unique;

-- Backfill existing users with a random token.
update public.profiles
  set widget_token = encode(gen_random_bytes(24), 'hex')
  where widget_token is null;

-- Trigger to auto-assign on new profile insert (belt + braces —
-- handle_new_user should also cover this).
create or replace function public.tg_set_widget_token()
returns trigger language plpgsql as $$
begin
  if new.widget_token is null then
    new.widget_token := encode(gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_widget_token on public.profiles;
create trigger profiles_set_widget_token
  before insert on public.profiles
  for each row execute function public.tg_set_widget_token();
