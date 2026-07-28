-- Friend styles you (AJA-240) — Phase 1: schema + RLS + realtime.
-- A time-boxed session where a friend helps you get dressed on one shared canvas.
-- THE OWNER ASKS; the friend accepts. Nobody volunteers to style someone else, and
-- making the owner the creator is also the safer shape: the insert policy is
-- owner_id = auth.uid(), so a row granting access to SOMEONE ELSE's closet cannot be
-- constructed at all. (A stylist-initiated flow would have to permit inserting a row
-- that names another user as owner.)
--
--   styling_sessions        — the ask + its lifecycle, and the SHARED board settings
--                             (aspect/background live here so both phones agree)
--   styling_session_items   — the owner's closet, snapshotted (same reason as
--                             shared_closet_items: real closets live in a private
--                             per-user wardrobe_snapshots blob the friend can't read)
--   styling_session_pieces  — the live board, ONE ROW PER CANVAS ELEMENT, in
--                             normalized 0..1 coordinates so two devices with
--                             different screen sizes stay in agreement
--
-- Mirrors the shared-closet stack (20260728/20260729) including its SECURITY DEFINER
-- membership helpers, which keep membership checks off the policies' own tables and
-- avoid a recursive-RLS loop.

-- 1. tables -----------------------------------------------------------------
create table if not exists public.styling_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,   -- whose closet
  stylist_id uuid not null references auth.users(id) on delete cascade, -- who was asked
  status text not null default 'requested',   -- 'requested' | 'active' | 'ended' | 'declined'
  note text,                                  -- "what's the occasion", from the owner
  aspect text not null default '3:4',         -- SHARED board shape (was local-only state)
  canvas_bg text,                             -- SHARED board background
  saved_outfit_id text,                       -- the owner's outfit id, once they save
  owner_name text,                            -- denormalized identity (no profiles join)
  owner_handle text,
  owner_avatar text,
  stylist_name text,
  stylist_handle text,
  stylist_avatar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  ended_at timestamptz,
  -- A forgotten session must not leave a closet readable forever.
  expires_at timestamptz not null default now() + interval '12 hours',
  constraint styling_sessions_not_self check (owner_id <> stylist_id),
  constraint styling_sessions_status_valid
    check (status in ('requested', 'active', 'ended', 'declined'))
);
create index if not exists styling_sessions_owner_idx
  on public.styling_sessions (owner_id, created_at desc);
create index if not exists styling_sessions_stylist_idx
  on public.styling_sessions (stylist_id, status);
-- One live session per pair — asking twice reuses the pending ask instead of stacking.
create unique index if not exists styling_sessions_live_pair_idx
  on public.styling_sessions (owner_id, stylist_id)
  where status in ('requested', 'active');
alter table public.styling_sessions enable row level security;

create table if not exists public.styling_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.styling_sessions(id) on delete cascade,
  item_ref text not null,                     -- the owner's wardrobe item id (from their blob)
  item_name text,
  item_image_url text,
  item_category text,
  item_subcategory text,
  item_brand text,
  item_color text,
  created_at timestamptz not null default now(),
  unique (session_id, item_ref)
);
create index if not exists styling_session_items_session_idx
  on public.styling_session_items (session_id);
alter table public.styling_session_items enable row level security;

create table if not exists public.styling_session_pieces (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.styling_sessions(id) on delete cascade,
  piece_id text not null,                     -- the client's CanvasItem.id
  kind text not null default 'item',          -- 'item' | 'text' | 'sticker'
  item_ref text,
  text_content text,
  color text,
  emoji text,
  -- Normalized 0..1 fractions of the board, NOT pixels. The canvas works in board
  -- pixels whose size depends on viewport and aspect, so raw x/y would put the two
  -- phones on visibly different boards.
  nx double precision not null default 0,
  ny double precision not null default 0,
  nw double precision not null default 0.4,
  nh double precision not null default 0.4,
  rotation double precision not null default 0,
  z_index integer not null default 0,
  flipped boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, piece_id)
);
create index if not exists styling_session_pieces_session_idx
  on public.styling_session_pieces (session_id);
alter table public.styling_session_pieces enable row level security;

-- 2. membership helpers (SECURITY DEFINER → bypass RLS, no recursion) --------
-- NOTE: there is deliberately NO is_styling_participant() helper backing the
-- styling_sessions SELECT policy. A STABLE SECURITY DEFINER function reads from the
-- statement's snapshot, so it cannot see the row the current statement is inserting —
-- which makes `insert ... returning` (i.e. supabase .insert().select().single(), how
-- the client creates a session) fail its own SELECT check with a 42501. The sessions
-- row carries both user ids, so that policy compares columns directly instead.
-- The child tables are safe: they check the PARENT session row, which is already
-- committed by the time they're written.
-- (The helper is dropped in section 3, once the policies that used to reference it
-- have been redefined.)

create or replace function public.is_styling_owner(p_session uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.styling_sessions s
    where s.id = p_session and s.owner_id = p_user
  );
$$;

-- THE access gate. Items and the board are readable only while the session is live,
-- so ending it (or letting it expire) revokes the friend's access in the database —
-- not merely by hiding a screen.
create or replace function public.is_styling_active(p_session uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.styling_sessions s
    where s.id = p_session
      and s.status = 'active'
      and s.expires_at > now()
      and (s.owner_id = p_user or s.stylist_id = p_user)
  );
$$;

-- 3. policies ---------------------------------------------------------------
-- styling_sessions: both sides read it (the friend must see the ask before accepting);
-- ONLY the owner can create one, and only naming themselves as owner.
drop policy if exists "read own styling sessions" on public.styling_sessions;
create policy "read own styling sessions" on public.styling_sessions for select
  using (owner_id = auth.uid() or stylist_id = auth.uid());
drop policy if exists "owner asks for styling" on public.styling_sessions;
create policy "owner asks for styling" on public.styling_sessions for insert
  with check (owner_id = auth.uid() and status = 'requested');
-- Either side may update (accept, decline, end, move the board settings). WHICH
-- transitions are legal is enforced by the guard trigger below, because a WITH CHECK
-- clause cannot see the OLD row.
drop policy if exists "participants update styling session" on public.styling_sessions;
create policy "participants update styling session" on public.styling_sessions for update
  using (owner_id = auth.uid() or stylist_id = auth.uid());
drop policy if exists "owner deletes styling session" on public.styling_sessions;
create policy "owner deletes styling session" on public.styling_sessions for delete
  using (owner_id = auth.uid());

-- Now that nothing references it, retire the helper (see the note in section 2).
drop function if exists public.is_styling_participant(uuid, uuid);

-- styling_session_items: the OWNER writes their own closet snapshot (they seed it when
-- they ask, and refresh it when the board opens). The friend can only read, and only
-- while the session is live.
drop policy if exists "read styling items" on public.styling_session_items;
create policy "read styling items" on public.styling_session_items for select
  using (
    public.is_styling_active(session_id, auth.uid())
    or public.is_styling_owner(session_id, auth.uid())
  );
drop policy if exists "owner seeds styling items" on public.styling_session_items;
create policy "owner seeds styling items" on public.styling_session_items for insert
  with check (public.is_styling_owner(session_id, auth.uid()));
drop policy if exists "owner updates styling items" on public.styling_session_items;
create policy "owner updates styling items" on public.styling_session_items for update
  using (public.is_styling_owner(session_id, auth.uid()));
drop policy if exists "owner removes styling items" on public.styling_session_items;
create policy "owner removes styling items" on public.styling_session_items for delete
  using (public.is_styling_owner(session_id, auth.uid()));

-- styling_session_pieces: CO-EDITED, but only while live. The owner keeps read access
-- afterwards so a board isn't lost if the session ends before they save it.
drop policy if exists "read styling pieces" on public.styling_session_pieces;
create policy "read styling pieces" on public.styling_session_pieces for select
  using (
    public.is_styling_active(session_id, auth.uid())
    or public.is_styling_owner(session_id, auth.uid())
  );
drop policy if exists "live participants add pieces" on public.styling_session_pieces;
create policy "live participants add pieces" on public.styling_session_pieces for insert
  with check (public.is_styling_active(session_id, auth.uid()) and updated_by = auth.uid());
drop policy if exists "live participants move pieces" on public.styling_session_pieces;
create policy "live participants move pieces" on public.styling_session_pieces for update
  using (public.is_styling_active(session_id, auth.uid()));
drop policy if exists "live participants remove pieces" on public.styling_session_pieces;
create policy "live participants remove pieces" on public.styling_session_pieces for delete
  using (public.is_styling_active(session_id, auth.uid()));

-- 4. triggers ---------------------------------------------------------------
-- Lifecycle guard. RLS can say WHO may update; only a trigger can say WHICH transition
-- is legal, since WITH CHECK has no access to the OLD row.
create or replace function public.guard_styling_session_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.owner_id <> OLD.owner_id or NEW.stylist_id <> OLD.stylist_id then
    raise exception 'the two people in a styling session are fixed';
  end if;
  if OLD.status in ('ended', 'declined') and NEW.status <> OLD.status then
    raise exception 'styling session is already %', OLD.status;
  end if;
  -- Only the person who was asked may answer the ask. The owner can still cancel
  -- (requested -> ended), which this does not block.
  if OLD.status = 'requested'
     and NEW.status in ('active', 'declined')
     and auth.uid() <> OLD.stylist_id then
    raise exception 'only the friend who was asked can answer this request';
  end if;
  if NEW.status <> OLD.status then
    if NEW.status = 'active' then
      NEW.responded_at := now();
      -- The clock starts when styling actually starts, not when the ask was sent.
      NEW.expires_at := now() + interval '12 hours';
    end if;
    if NEW.status in ('ended', 'declined') then
      NEW.ended_at := now();
    end if;
  end if;
  NEW.updated_at := now();
  return NEW;
end; $$;
drop trigger if exists trg_guard_styling_session on public.styling_sessions;
create trigger trg_guard_styling_session before update on public.styling_sessions
  for each row execute function public.guard_styling_session_update();

create or replace function public.touch_styling_piece_ts()
returns trigger language plpgsql as $$
begin NEW.updated_at := now(); return NEW; end; $$;
drop trigger if exists trg_styling_pieces_touch on public.styling_session_pieces;
create trigger trg_styling_pieces_touch before update on public.styling_session_pieces
  for each row execute function public.touch_styling_piece_ts();

-- 5. notifications ----------------------------------------------------------
-- Deep-link column: which session a styling notification points at. Unlike
-- shared_closet_id this one IS mapped through notifications.ts, so the notification
-- opens the specific session rather than a tab.
alter table public.notifications
  add column if not exists styling_session_id uuid
  references public.styling_sessions(id) on delete cascade;

-- 'style_request' (owner -> friend) and 'style_accepted' (friend -> owner). Created
-- ONLY by these SECURITY DEFINER triggers; notifications has no client insert policy,
-- so neither can be forged.
create or replace function public.notify_style_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status <> 'requested' or NEW.owner_id = NEW.stylist_id then
    return null;
  end if;
  insert into public.notifications
    (recipient_id, actor_id, actor_name, actor_handle, actor_avatar,
     kind, post_id, styling_session_id, preview)
  values
    (NEW.stylist_id, NEW.owner_id, NEW.owner_name, NEW.owner_handle, NEW.owner_avatar,
     'style_request', null, NEW.id, NEW.note);
  return null;
end; $$;
drop trigger if exists trg_notify_style_request on public.styling_sessions;
create trigger trg_notify_style_request after insert on public.styling_sessions
  for each row execute function public.notify_style_request();

create or replace function public.notify_style_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if OLD.status = 'requested' and NEW.status = 'active' then
    insert into public.notifications
      (recipient_id, actor_id, actor_name, actor_handle, actor_avatar,
       kind, post_id, styling_session_id, preview)
    values
      (NEW.owner_id, NEW.stylist_id, NEW.stylist_name, NEW.stylist_handle, NEW.stylist_avatar,
       'style_accepted', null, NEW.id, NEW.note);
  end if;
  return null;
end; $$;
drop trigger if exists trg_notify_style_accepted on public.styling_sessions;
create trigger trg_notify_style_accepted after update on public.styling_sessions
  for each row execute function public.notify_style_accepted();

-- 6. realtime ---------------------------------------------------------------
-- Both sides get live postgres_changes on the board and the session row (so an accept
-- or an end lands immediately on the other phone). RLS applies to realtime too — a
-- subscriber only hears about rows it can SELECT, which means ending a session also
-- stops the friend's stream. Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'styling_session_pieces'
  ) then
    alter publication supabase_realtime add table public.styling_session_pieces;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'styling_sessions'
  ) then
    alter publication supabase_realtime add table public.styling_sessions;
  end if;
end $$;
