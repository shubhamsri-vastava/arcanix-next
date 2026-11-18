-- A pending requester must not be able to accept their own connection request.
-- Limit insert/update columns and bind each status transition to its actor.
revoke insert on public.connections from authenticated;
grant insert(requester_id, recipient_id) on public.connections to authenticated;
revoke update on public.connections from authenticated;
grant update(status) on public.connections to authenticated;

create or replace function private.stamp_connection_response() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.responded_at = now();
    new.blocked_by = case when new.status = 'blocked' then (select auth.uid()) else null end;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_connection_response() from public;
create trigger connections_stamp_response
before update of status on public.connections
for each row execute function private.stamp_connection_response();

drop policy if exists connections_recipient_update on public.connections;
drop policy if exists connections_request on public.connections;

create policy connections_request on public.connections
for insert to authenticated
with check (
  requester_id = (select auth.uid())
  and requester_id <> recipient_id
  and status = 'pending'
  and responded_at is null
  and blocked_by is null
  and private.actor_is_active()
);

create policy connections_recipient_update on public.connections
for update to authenticated
using (recipient_id = (select auth.uid()) and status = 'pending' and private.actor_is_active())
with check (
  recipient_id = (select auth.uid())
  and status in ('accepted', 'declined')
  and blocked_by is null
  and responded_at is not null
  and private.actor_is_active()
);

create policy connections_requester_cancel on public.connections
for update to authenticated
using (requester_id = (select auth.uid()) and status = 'pending' and private.actor_is_active())
with check (
  requester_id = (select auth.uid())
  and status = 'cancelled'
  and blocked_by is null
  and responded_at is not null
  and private.actor_is_active()
);

create policy connections_participant_block on public.connections
for update to authenticated
using (
  (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  and status in ('pending', 'accepted', 'declined')
  and private.actor_is_active()
)
with check (
  (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  and status = 'blocked'
  and blocked_by = (select auth.uid())
  and responded_at is not null
  and private.actor_is_active()
);
