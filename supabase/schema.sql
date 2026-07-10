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
