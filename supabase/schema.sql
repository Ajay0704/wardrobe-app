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

-- ---------------------------------------------------------------------------
-- AJA-275 / AJA-276 — PRIVATE bucket for the user's own body imagery.
--
-- Holds BOTH the on-body try-on renders (AJA-275, `Outfit.tryOnRenderPath`) and the
-- saved reference photo they are generated from (AJA-276, `profile.tryOnPhotoPath`).
-- Same sensitivity class, so the same bucket and the same policies — and note the
-- policies below are scoped to the bucket plus `foldername[1] = uid`, NOT to a
-- filename pattern, so the reference photo needed no new SQL.
--
-- Deliberately NOT `wardrobe-images`. That bucket is public=true with a "Public
-- read wardrobe images" policy over the whole bucket, which is the right call for
-- a photo of a jumper and the wrong call for a photograph of the user's face and
-- body. Both kinds of object here are the latter, so they get their own bucket and
-- their own blast radius.
--
-- Objects here are readable ONLY by their owner, and only via a short-lived
-- signed URL (createSignedUrl). Never store a signed URL — see
-- src/lib/supabase/private-storage.ts for why.
--
-- There is NO update policy, deliberately: replacing an object means uploading a
-- fresh uuid, repointing, then deleting the old one. An `upsert: true` write to a
-- stable filename would be refused by RLS.
--
-- Paths are FLAT: `<user-id>/<uuid>.jpg`. The binding reason is `isRenderPath`,
-- which allows exactly one slash, so every validator in the app rejects a nested
-- path. (Account deletion's sweep is recursive since AJA-275 and would cope either
-- way — an earlier version of this comment said otherwise.)
--
-- Unlike the blocks above, this one is re-runnable: the drops make re-applying
-- schema.sql safe instead of erroring on an existing policy.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('renders-private', 'renders-private', false)
on conflict (id) do nothing;

drop policy if exists "Users read own renders" on storage.objects;
create policy "Users read own renders"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'renders-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users upload own renders" on storage.objects;
create policy "Users upload own renders"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'renders-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A new capability: `wardrobe-images` has NO delete policy, so clients cannot
-- remove their own objects there at all. Body imagery needs a user-driven wipe,
-- so grant delete — scoped to this bucket and the caller's own folder only.
drop policy if exists "Users delete own renders" on storage.objects;
create policy "Users delete own renders"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'renders-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
