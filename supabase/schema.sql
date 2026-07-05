-- Your Personal Wardrobe schema for Supabase
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- One snapshot row per authenticated user (anonymous or email auth).
create table if not exists public.wardrobe_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  outfits jsonb not null default '[]'::jsonb,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  draft jsonb not null default '{}'::jsonb,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.wardrobe_snapshots enable row level security;

create policy "Users read own snapshot"
  on public.wardrobe_snapshots for select
  using (auth.uid() = user_id);

create policy "Users insert own snapshot"
  on public.wardrobe_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users update own snapshot"
  on public.wardrobe_snapshots for update
  using (auth.uid() = user_id);

-- If you already ran an older version of this schema, add the profile column:
-- alter table public.wardrobe_snapshots add column if not exists profile jsonb not null default '{}'::jsonb;


-- ---------------------------------------------------------------------------
-- Usernames: unique login handles mapped to each account's email.
-- Sign-in is by username; Supabase Auth still authenticates by email under
-- the hood, so we resolve username -> email at login time.
--
-- Uniqueness is enforced by the primary key (case-sensitive text compare),
-- so two users can never claim the same handle even under a race.
-- ---------------------------------------------------------------------------
create table if not exists public.usernames (
  username text primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.usernames enable row level security;

-- A signed-in user may read, claim, and change only their own handle.
create policy "Users read own username"
  on public.usernames for select
  using (auth.uid() = user_id);

create policy "Users insert own username"
  on public.usernames for insert
  with check (auth.uid() = user_id);

create policy "Users update own username"
  on public.usernames for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Availability check that bypasses RLS (SECURITY DEFINER) so it can see all
-- rows. Returns true when the handle is free. Case-sensitive exact match.
create or replace function public.username_available(name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (select 1 from public.usernames where username = name);
$$;

-- Resolve a username to the account email for username-based sign-in.
create or replace function public.email_for_username(name text)
returns text
language sql
security definer
set search_path = public
as $$
  select email from public.usernames where username = name;
$$;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.email_for_username(text) to anon, authenticated;


-- Enable email/password auth in Supabase Dashboard:
-- Authentication → Providers → Email → Enable
-- Authentication → Providers → Email → Confirm email → OFF (no verification yet)
