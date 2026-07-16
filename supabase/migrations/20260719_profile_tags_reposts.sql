-- AJA-139: profile page — tag people in posts + reposts ("Shared" tab).
-- Posts are already public-read (20260714_community.sql), so the new column
-- needs no policy change. post_reposts mirrors the post_saves table's RLS.

-- Tag people in a post (the profile "Tagged" tab queries this).
alter table public.posts
  add column if not exists tagged_user_ids uuid[] not null default '{}';

-- Fast "posts where I'm tagged" lookups.
create index if not exists posts_tagged_user_ids_idx
  on public.posts using gin (tagged_user_ids);

-- Reposts (the profile "Shared" tab). One row per (reposter, post).
create table if not exists public.post_reposts (
  reposter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reposter_id, post_id)
);
alter table public.post_reposts enable row level security;
drop policy if exists "read reposts" on public.post_reposts;
create policy "read reposts" on public.post_reposts for select using (true);
drop policy if exists "repost self" on public.post_reposts;
create policy "repost self" on public.post_reposts for insert with check (auth.uid() = reposter_id);
drop policy if exists "unrepost self" on public.post_reposts;
create policy "unrepost self" on public.post_reposts for delete using (auth.uid() = reposter_id);

create index if not exists post_reposts_reposter_idx
  on public.post_reposts (reposter_id, created_at desc);
