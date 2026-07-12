-- Your Personal Wardrobe schema for Supabase
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- One snapshot row per authenticated user (anonymous or email auth).
create table if not exists public.wardrobe_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  outfits jsonb not null default '[]'::jsonb,
  trips jsonb not null default '[]'::jsonb,
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

-- If you already ran an older version of this schema, add missing columns:
-- alter table public.wardrobe_snapshots add column if not exists profile jsonb not null default '{}'::jsonb;
-- alter table public.wardrobe_snapshots add column if not exists trips jsonb not null default '[]'::jsonb;
alter table public.wardrobe_snapshots
  add column if not exists calendar jsonb not null default '[]'::jsonb;


-- ---------------------------------------------------------------------------
-- Web Push subscriptions (Phase 1.3). Written via service role from
-- /api/push/subscribe; read by the daily cron job.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- No direct client policies — API uses the service role key.


-- Enable email/password auth in Supabase Dashboard:
-- Authentication → Providers → Email → Enable
-- Authentication → Providers → Email → Confirm email → OFF (no verification yet)


-- ---------------------------------------------------------------------------
-- Storage bucket for uploaded item + avatar images. Keeping images here (as
-- URLs) instead of base64 inside the snapshot keeps sync fast. The app falls
-- back to inline data URLs if this bucket doesn't exist, so it's optional but
-- strongly recommended.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', true)
on conflict (id) do nothing;

-- Anyone can view images; authenticated users may upload only into their own
-- <user-id>/ folder.
create policy "Public read wardrobe images"
  on storage.objects for select
  using (bucket_id = 'wardrobe-images');

create policy "Users upload own wardrobe images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wardrobe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Share Closet — public ask-friends links + guest replies
-- ---------------------------------------------------------------------------
create table if not exists public.closet_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  question text not null,
  items jsonb not null default '[]'::jsonb,
  owner_name text,
  created_at timestamptz not null default now()
);

create index if not exists closet_shares_user_id_idx
  on public.closet_shares (user_id);

create table if not exists public.closet_share_replies (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.closet_shares (id) on delete cascade,
  author_name text not null default 'Friend',
  message text not null,
  suggested_item_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists closet_share_replies_share_id_idx
  on public.closet_share_replies (share_id);

alter table public.closet_shares enable row level security;
alter table public.closet_share_replies enable row level security;
