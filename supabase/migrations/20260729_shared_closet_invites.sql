-- Shared Closets (AJA-212/215) — Phase 2: invites (invitee visibility + notification).
-- The invite mechanics reuse the Phase 0 schema: an invite is a shared_closet_members
-- row with status='invited' (owner inserts), accept = invitee updates their own row to
-- 'joined', decline/leave = they delete it — all already allowed by Phase 0 RLS. This
-- migration adds only what invites need on top: letting an invited (not-yet-joined)
-- user READ the closet row (so the invite card can show its name) and notifying them.
-- Mirrors 20260725_trip_invites.sql + 20260727_notification_trip_link.sql.

-- 1. An invited user must read the closet row. is_closet_member stays joined-only (it
--    gates item read/write); a broader participant check (any membership row, or owner)
--    backs the shared_closets SELECT policy.
create or replace function public.is_closet_participant(p_closet uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.shared_closet_members m where m.closet_id = p_closet and m.user_id = p_user
  ) or exists (
    select 1 from public.shared_closets c where c.id = p_closet and c.owner_id = p_user
  );
$$;

drop policy if exists "read member closets" on public.shared_closets;
create policy "read member closets" on public.shared_closets for select
  using (owner_id = auth.uid() or public.is_closet_participant(id, auth.uid()));

-- 2. Deep-link column: which shared closet an invite notification points at.
alter table public.notifications
  add column if not exists shared_closet_id uuid references public.shared_closets(id) on delete cascade;

-- 3. closet_invite notification — created ONLY by this SECURITY DEFINER trigger (the
--    notifications table has no client insert policy, so a user can't forge one). Fires
--    when an 'invited' row is added: recipient = invitee, actor = inviter, preview = the
--    closet name (read here bypassing RLS). Mirrors notify_trip_invite.
create or replace function public.notify_closet_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if NEW.status <> 'invited' or NEW.user_id = NEW.invited_by then
    return null;  -- owner auto-join row / self-invite → nothing to notify
  end if;
  select name into v_name from public.shared_closets where id = NEW.closet_id;
  insert into public.notifications
    (recipient_id, actor_id, actor_name, actor_handle, actor_avatar, kind, post_id, shared_closet_id, preview)
  values
    (NEW.user_id, NEW.invited_by, NEW.inviter_name, NEW.inviter_handle, NEW.inviter_avatar,
     'closet_invite', null, NEW.closet_id, v_name);
  return null;
end; $$;
drop trigger if exists trg_notify_closet_invite on public.shared_closet_members;
create trigger trg_notify_closet_invite after insert on public.shared_closet_members
  for each row execute function public.notify_closet_invite();
