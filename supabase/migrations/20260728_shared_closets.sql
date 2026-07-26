-- Shared Closets (AJA-212/213) — Phase 0: schema + RLS + realtime.
-- A collaborative closet a small group co-owns: every joined member can add items
-- AND edit/remove ANY item (true co-ownership — this is the one deliberate change
-- from trips, where a packer only touches their own rows). Mirrors the Pack With
-- Friends stack (trips/trip_members/trip_items) and its conventions:
--   shared_closets         — the closet, owned by one user
--   shared_closet_members  — roster + invites (role/status); identity denormalized
--                            onto the row (rendered without a profiles join)
--   shared_closet_items    — the co-owned items; snapshotted (name/image/category/
--                            brand/color) because each member's real closet lives in
--                            a private per-user wardrobe_snapshots blob, so a member
--                            must render another's item without reading that row.
-- SECURITY DEFINER helpers keep membership checks off the policies' own tables to
-- avoid a recursive-RLS loop (same convention as is_trip_member).

-- 1. tables -----------------------------------------------------------------
create table if not exists public.shared_closets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Shared closet',
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shared_closets_owner_idx on public.shared_closets (owner_id, created_at desc);
alter table public.shared_closets enable row level security;

create table if not exists public.shared_closet_members (
  closet_id uuid not null references public.shared_closets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',            -- 'owner' | 'member'
  status text not null default 'invited',          -- 'invited' | 'joined'
  invited_by uuid references auth.users(id) on delete set null,
  member_name text,                                -- denormalized identity (no profiles join)
  member_handle text,
  member_avatar text,
  inviter_name text,
  inviter_handle text,
  inviter_avatar text,
  created_at timestamptz not null default now(),
  primary key (closet_id, user_id)
);
create index if not exists shared_closet_members_user_idx on public.shared_closet_members (user_id, status);
alter table public.shared_closet_members enable row level security;

create table if not exists public.shared_closet_items (
  id uuid primary key default gen_random_uuid(),
  closet_id uuid not null references public.shared_closets(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  item_ref text not null,                          -- the adder's wardrobe item id (from their blob)
  item_name text,
  item_image_url text,
  item_category text,
  item_brand text,
  item_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (closet_id, item_ref, added_by)           -- a member can't add the same item twice
);
create index if not exists shared_closet_items_closet_idx on public.shared_closet_items (closet_id);
alter table public.shared_closet_items enable row level security;

-- 2. membership helpers (SECURITY DEFINER → bypass RLS, no recursion) --------
create or replace function public.is_closet_member(p_closet uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.shared_closet_members m
    where m.closet_id = p_closet and m.user_id = p_user and m.status = 'joined'
  ) or exists (
    select 1 from public.shared_closets c
    where c.id = p_closet and c.owner_id = p_user
  );
$$;

create or replace function public.is_closet_owner(p_closet uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.shared_closets c where c.id = p_closet and c.owner_id = p_user);
$$;

-- 3. policies ---------------------------------------------------------------
-- shared_closets: members read; owner writes. (Phase 2 broadens read to invitees
-- via is_closet_participant so an invite card can show the closet name.)
drop policy if exists "read member closets" on public.shared_closets;
create policy "read member closets" on public.shared_closets for select
  using (owner_id = auth.uid() or public.is_closet_member(id, auth.uid()));
drop policy if exists "insert own closets" on public.shared_closets;
create policy "insert own closets" on public.shared_closets for insert
  with check (owner_id = auth.uid());
drop policy if exists "update own closets" on public.shared_closets;
create policy "update own closets" on public.shared_closets for update
  using (owner_id = auth.uid());
drop policy if exists "delete own closets" on public.shared_closets;
create policy "delete own closets" on public.shared_closets for delete
  using (owner_id = auth.uid());

-- shared_closet_members: any member reads the roster; owner invites; a user may
-- flip or remove ONLY their own row (accept invite / leave).
drop policy if exists "read closet roster" on public.shared_closet_members;
create policy "read closet roster" on public.shared_closet_members for select
  using (user_id = auth.uid() or public.is_closet_member(closet_id, auth.uid()) or public.is_closet_owner(closet_id, auth.uid()));
drop policy if exists "owner invites to closet" on public.shared_closet_members;
create policy "owner invites to closet" on public.shared_closet_members for insert
  with check (public.is_closet_owner(closet_id, auth.uid()));
drop policy if exists "respond or manage closet membership" on public.shared_closet_members;
create policy "respond or manage closet membership" on public.shared_closet_members for update
  using (user_id = auth.uid() or public.is_closet_owner(closet_id, auth.uid()));
drop policy if exists "leave or remove closet membership" on public.shared_closet_members;
create policy "leave or remove closet membership" on public.shared_closet_members for delete
  using (user_id = auth.uid() or public.is_closet_owner(closet_id, auth.uid()));

-- shared_closet_items: CO-OWNED. Any joined member reads, adds, edits, and removes
-- ANY item in a closet they belong to (this is the intended difference from trips).
drop policy if exists "read closet items" on public.shared_closet_items;
create policy "read closet items" on public.shared_closet_items for select
  using (public.is_closet_member(closet_id, auth.uid()));
drop policy if exists "member adds closet items" on public.shared_closet_items;
create policy "member adds closet items" on public.shared_closet_items for insert
  with check (added_by = auth.uid() and public.is_closet_member(closet_id, auth.uid()));
drop policy if exists "member edits closet items" on public.shared_closet_items;
create policy "member edits closet items" on public.shared_closet_items for update
  using (public.is_closet_member(closet_id, auth.uid()));
drop policy if exists "member removes closet items" on public.shared_closet_items;
create policy "member removes closet items" on public.shared_closet_items for delete
  using (public.is_closet_member(closet_id, auth.uid()));

-- 4. triggers ---------------------------------------------------------------
-- Owner becomes a joined member on closet creation, so the roster always includes them.
create or replace function public.add_shared_closet_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.shared_closet_members (closet_id, user_id, role, status)
  values (NEW.id, NEW.owner_id, 'owner', 'joined')
  on conflict (closet_id, user_id) do nothing;
  return null;
end; $$;
drop trigger if exists trg_shared_closet_owner on public.shared_closets;
create trigger trg_shared_closet_owner after insert on public.shared_closets
  for each row execute function public.add_shared_closet_owner_member();

-- Bump updated_at on any row change (closets + items both carry updated_at).
create or replace function public.touch_shared_closet_ts()
returns trigger language plpgsql as $$
begin NEW.updated_at := now(); return NEW; end; $$;
drop trigger if exists trg_shared_closets_touch on public.shared_closets;
create trigger trg_shared_closets_touch before update on public.shared_closets
  for each row execute function public.touch_shared_closet_ts();
drop trigger if exists trg_shared_closet_items_touch on public.shared_closet_items;
create trigger trg_shared_closet_items_touch before update on public.shared_closet_items
  for each row execute function public.touch_shared_closet_ts();

-- 5. realtime ---------------------------------------------------------------
-- Members get live postgres_changes when items or the roster change. RLS applies to
-- realtime too (a subscriber only hears about rows it can SELECT). Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_closet_items'
  ) then
    alter publication supabase_realtime add table public.shared_closet_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_closet_members'
  ) then
    alter publication supabase_realtime add table public.shared_closet_members;
  end if;
end $$;
