-- Pack with friends — Phase 0: shared trips schema + RLS.
-- Trips move from local (each user's wardrobe_snapshots blob) to a shared server
-- resource so members can each pack from their OWN closet into one trip. Tables:
--   trips        — the trip, owned by one user
--   trip_members — roster + invites (role/status); display identity denormalized
--                  (there is no profiles table — mirrors posts/notifications)
--   trip_items   — what each member packed; the item is snapshotted (name/image/
--                  category) because closets live in private per-user blobs, so a
--                  member must be able to render a friend's pick without reading
--                  that friend's private wardrobe_snapshots row.
-- RLS is the safety spine: you see a trip only if you're a member; you pack/unpack
-- only your OWN items; only the owner edits the trip or invites. Two SECURITY
-- DEFINER helpers keep membership checks off the policies' own tables so there's no
-- recursive-RLS loop (same convention as bump_post_counter / create_notification).

-- 1. tables -----------------------------------------------------------------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'New trip',
  destination text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trips_owner_idx on public.trips (owner_id, created_at desc);
alter table public.trips enable row level security;

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',           -- 'owner' | 'member'
  status text not null default 'invited',         -- 'invited' | 'joined'
  invited_by uuid references auth.users(id) on delete set null,
  member_name text,                               -- denormalized identity (no profiles table)
  member_handle text,
  member_avatar text,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user_idx on public.trip_members (user_id, status);
alter table public.trip_members enable row level security;

create table if not exists public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  packer_id uuid not null references auth.users(id) on delete cascade,
  item_ref text not null,                         -- the packer's wardrobe item id (from their blob)
  item_name text,
  item_image_url text,
  item_category text,
  created_at timestamptz not null default now(),
  unique (trip_id, packer_id, item_ref)           -- a user can't double-pack the same item
);
create index if not exists trip_items_trip_idx on public.trip_items (trip_id);
alter table public.trip_items enable row level security;

-- 2. membership helpers (SECURITY DEFINER → bypass RLS, no recursion) --------
create or replace function public.is_trip_member(p_trip uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip and m.user_id = p_user and m.status = 'joined'
  ) or exists (
    select 1 from public.trips t
    where t.id = p_trip and t.owner_id = p_user
  );
$$;

create or replace function public.is_trip_owner(p_trip uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.trips t where t.id = p_trip and t.owner_id = p_user);
$$;

-- 3. policies ---------------------------------------------------------------
-- trips: members read; owner writes.
drop policy if exists "read member trips" on public.trips;
create policy "read member trips" on public.trips for select
  using (owner_id = auth.uid() or public.is_trip_member(id, auth.uid()));
drop policy if exists "insert own trips" on public.trips;
create policy "insert own trips" on public.trips for insert
  with check (owner_id = auth.uid());
drop policy if exists "update own trips" on public.trips;
create policy "update own trips" on public.trips for update
  using (owner_id = auth.uid());
drop policy if exists "delete own trips" on public.trips;
create policy "delete own trips" on public.trips for delete
  using (owner_id = auth.uid());

-- trip_members: any member reads the roster; owner invites/manages; a user may
-- flip or remove ONLY their own row (accept invite / leave).
drop policy if exists "read trip roster" on public.trip_members;
create policy "read trip roster" on public.trip_members for select
  using (user_id = auth.uid() or public.is_trip_member(trip_id, auth.uid()) or public.is_trip_owner(trip_id, auth.uid()));
drop policy if exists "owner invites" on public.trip_members;
create policy "owner invites" on public.trip_members for insert
  with check (public.is_trip_owner(trip_id, auth.uid()));
drop policy if exists "respond or manage membership" on public.trip_members;
create policy "respond or manage membership" on public.trip_members for update
  using (user_id = auth.uid() or public.is_trip_owner(trip_id, auth.uid()));
drop policy if exists "leave or remove membership" on public.trip_members;
create policy "leave or remove membership" on public.trip_members for delete
  using (user_id = auth.uid() or public.is_trip_owner(trip_id, auth.uid()));

-- trip_items: members read the whole bag; you insert/delete only your OWN items,
-- and only into a trip you belong to.
drop policy if exists "read trip items" on public.trip_items;
create policy "read trip items" on public.trip_items for select
  using (public.is_trip_member(trip_id, auth.uid()));
drop policy if exists "pack own items" on public.trip_items;
create policy "pack own items" on public.trip_items for insert
  with check (packer_id = auth.uid() and public.is_trip_member(trip_id, auth.uid()));
drop policy if exists "unpack own items" on public.trip_items;
create policy "unpack own items" on public.trip_items for delete
  using (packer_id = auth.uid());

-- 4. triggers ---------------------------------------------------------------
-- Owner becomes a joined member automatically on trip creation, so the roster and
-- the "Everyone" view always include them.
create or replace function public.add_trip_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.trip_members (trip_id, user_id, role, status)
  values (NEW.id, NEW.owner_id, 'owner', 'joined')
  on conflict (trip_id, user_id) do nothing;
  return null;
end; $$;
drop trigger if exists trg_trip_owner on public.trips;
create trigger trg_trip_owner after insert on public.trips
  for each row execute function public.add_trip_owner_member();

create or replace function public.touch_trips_updated_at()
returns trigger language plpgsql as $$
begin NEW.updated_at := now(); return NEW; end; $$;
drop trigger if exists trg_trips_touch on public.trips;
create trigger trg_trips_touch before update on public.trips
  for each row execute function public.touch_trips_updated_at();
