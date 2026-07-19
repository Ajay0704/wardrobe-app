-- Pack with friends — Phase 2: invites (participant visibility + invite notification).
-- The invite mechanics themselves reuse the Phase 0 schema: an invite is a
-- trip_members row with status='invited' (owner inserts it), accept = the invitee
-- updates their own row to 'joined', decline/leave = they delete their own row —
-- all already allowed by the Phase 0 RLS. This migration adds only what invites
-- need on top: letting an invited user SEE the trip, and notifying them.

-- 1. An invited (not-yet-joined) user must be able to read the trip row so the UI
--    can show "X invited you to <trip name>". is_trip_member stays joined-only (it
--    gates packing + item visibility); a broader participant check (any membership
--    row, or owner) backs the trips SELECT policy.
create or replace function public.is_trip_participant(p_trip uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.trip_members m where m.trip_id = p_trip and m.user_id = p_user
  ) or exists (
    select 1 from public.trips t where t.id = p_trip and t.owner_id = p_user
  );
$$;

drop policy if exists "read member trips" on public.trips;
create policy "read member trips" on public.trips for select
  using (owner_id = auth.uid() or public.is_trip_participant(id, auth.uid()));

-- 2. Inviter display identity denormalized onto the invite row (there is no profiles
--    table) so the notification trigger has an actor to copy — mirrors post_likes.actor_*.
alter table public.trip_members add column if not exists inviter_name text;
alter table public.trip_members add column if not exists inviter_handle text;
alter table public.trip_members add column if not exists inviter_avatar text;

-- 3. trip_invite notification — created ONLY by this SECURITY DEFINER trigger (the
--    notifications table has no client insert policy, so a user can't forge one).
--    Fires when an 'invited' row is added: recipient = invitee, actor = inviter,
--    preview = the trip name (read here bypassing RLS).
create or replace function public.notify_trip_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if NEW.status <> 'invited' or NEW.user_id = NEW.invited_by then
    return null;  -- owner auto-join row / self-invite → nothing to notify
  end if;
  select name into v_name from public.trips where id = NEW.trip_id;
  insert into public.notifications
    (recipient_id, actor_id, actor_name, actor_handle, actor_avatar, kind, post_id, preview)
  values
    (NEW.user_id, NEW.invited_by, NEW.inviter_name, NEW.inviter_handle, NEW.inviter_avatar,
     'trip_invite', null, v_name);
  return null;
end; $$;
drop trigger if exists trg_notify_trip_invite on public.trip_members;
create trigger trg_notify_trip_invite after insert on public.trip_members
  for each row execute function public.notify_trip_invite();
