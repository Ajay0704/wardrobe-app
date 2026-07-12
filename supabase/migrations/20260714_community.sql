-- Community posts (AJA-95). User-authored feed: OOTD, polls, style challenges.
-- All reads are public; writes are owner-only via RLS (auth.uid()).

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  author_handle text,
  author_avatar text,
  kind text not null,                          -- 'ootd' | 'poll' | 'style'
  image_url text,
  caption text,
  tags text[] not null default '{}',           -- shoppable / closet piece labels
  look_title text,                             -- style-challenge look name
  poll_options text[] not null default '{}',   -- poll option labels
  likes integer not null default 0,
  saves integer not null default 0,
  comments integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id);
alter table public.posts enable row level security;
drop policy if exists "read posts" on public.posts;
create policy "read posts" on public.posts for select using (true);
drop policy if exists "insert own posts" on public.posts;
create policy "insert own posts" on public.posts for insert with check (auth.uid() = author_id);
drop policy if exists "update own posts" on public.posts;
create policy "update own posts" on public.posts for update using (auth.uid() = author_id);
drop policy if exists "delete own posts" on public.posts;
create policy "delete own posts" on public.posts for delete using (auth.uid() = author_id);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
drop policy if exists "read likes" on public.post_likes;
create policy "read likes" on public.post_likes for select using (true);
drop policy if exists "like self" on public.post_likes;
create policy "like self" on public.post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "unlike self" on public.post_likes;
create policy "unlike self" on public.post_likes for delete using (auth.uid() = user_id);

create table if not exists public.post_saves (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_saves enable row level security;
drop policy if exists "read saves" on public.post_saves;
create policy "read saves" on public.post_saves for select using (true);
drop policy if exists "save self" on public.post_saves;
create policy "save self" on public.post_saves for insert with check (auth.uid() = user_id);
drop policy if exists "unsave self" on public.post_saves;
create policy "unsave self" on public.post_saves for delete using (auth.uid() = user_id);

create table if not exists public.poll_votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_idx integer not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.poll_votes enable row level security;
drop policy if exists "read votes" on public.poll_votes;
create policy "read votes" on public.poll_votes for select using (true);
drop policy if exists "vote self" on public.poll_votes;
create policy "vote self" on public.poll_votes for insert with check (auth.uid() = user_id);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);
alter table public.follows enable row level security;
drop policy if exists "read follows" on public.follows;
create policy "read follows" on public.follows for select using (true);
drop policy if exists "follow self" on public.follows;
create policy "follow self" on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "unfollow self" on public.follows;
create policy "unfollow self" on public.follows for delete using (auth.uid() = follower_id);

-- Keep posts.likes / posts.saves in sync with the join tables.
create or replace function public.bump_post_counter()
returns trigger language plpgsql security definer as $$
declare d int; pid uuid;
begin
  d := case when TG_OP = 'INSERT' then 1 else -1 end;
  pid := coalesce(NEW.post_id, OLD.post_id);
  if TG_TABLE_NAME = 'post_likes' then
    update public.posts set likes = greatest(0, likes + d) where id = pid;
  elsif TG_TABLE_NAME = 'post_saves' then
    update public.posts set saves = greatest(0, saves + d) where id = pid;
  end if;
  return null;
end; $$;

drop trigger if exists trg_post_likes on public.post_likes;
create trigger trg_post_likes after insert or delete on public.post_likes
  for each row execute function public.bump_post_counter();
drop trigger if exists trg_post_saves on public.post_saves;
create trigger trg_post_saves after insert or delete on public.post_saves
  for each row execute function public.bump_post_counter();
