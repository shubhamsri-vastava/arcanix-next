-- Allow signup to choose a player handle while keeping the database as the
-- authority for syntax and uniqueness. The Auth trigger still assigns the
-- player role and does not trust role metadata supplied by the browser.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_handle text := lower(trim(coalesce(new.raw_user_meta_data ->> 'handle', '')));
  safe_handle text;
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
begin
  if requested_handle ~ '^[a-z0-9_]{3,30}$' then
    safe_handle := requested_handle;
  else
    safe_handle := 'user_' || left(new.id::text, 8);
  end if;

  insert into public.profiles(id, handle, display_name)
  values (
    new.id,
    safe_handle,
    case when char_length(requested_name) between 1 and 100 then requested_name else 'New player' end
  );
  insert into public.user_settings(profile_id) values (new.id);
  insert into public.user_roles(user_id, role) values (new.id, 'player');
  return new;
end;
$$;

create or replace function public.is_handle_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(candidate ~ '^[a-zA-Z0-9_]{3,30}$', false)
    and not exists (
      select 1 from public.profiles p where lower(p.handle) = lower(candidate)
    );
$$;

revoke all on function public.is_handle_available(text) from public;
grant execute on function public.is_handle_available(text) to anon, authenticated;
