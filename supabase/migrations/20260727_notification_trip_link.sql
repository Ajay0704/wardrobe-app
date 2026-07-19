-- Pack with friends: deep-link the trip_invite notification to its trip. Adds a
-- trip_id to notifications and sets it from the invite trigger, so tapping the
-- notification can open the trip. on delete cascade — if the trip is deleted, its
-- now-stale invite notification goes with it.
alter table public.notifications
  add column if not exists trip_id uuid references public.trips(id) on delete cascade;

-- Re-create the invite trigger function to also stamp trip_id (trigger unchanged —
-- it calls this function by name).
create or replace function public.notify_trip_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if NEW.status <> 'invited' or NEW.user_id = NEW.invited_by then
    return null;
  end if;
  select name into v_name from public.trips where id = NEW.trip_id;
  insert into public.notifications
    (recipient_id, actor_id, actor_name, actor_handle, actor_avatar, kind, post_id, trip_id, preview)
  values
    (NEW.user_id, NEW.invited_by, NEW.inviter_name, NEW.inviter_handle, NEW.inviter_avatar,
     'trip_invite', null, NEW.trip_id, v_name);
  return null;
end; $$;
