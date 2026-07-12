-- Community comments (AJA-95). Public read; insert/delete own via RLS.
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  author_handle text,
  author_avatar text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;
drop policy if exists "read comments" on public.post_comments;
create policy "read comments" on public.post_comments for select using (true);
drop policy if exists "comment self" on public.post_comments;
create policy "comment self" on public.post_comments for insert with check (auth.uid() = user_id);
drop policy if exists "delete own comment" on public.post_comments;
create policy "delete own comment" on public.post_comments for delete using (auth.uid() = user_id);

-- Keep posts.comments in sync.
create or replace function public.bump_comment_counter()
returns trigger language plpgsql security definer as $$
declare d int; pid uuid;
begin
  d := case when TG_OP = 'INSERT' then 1 else -1 end;
  pid := coalesce(NEW.post_id, OLD.post_id);
  update public.posts set comments = greatest(0, comments + d) where id = pid;
  return null;
end; $$;
drop trigger if exists trg_post_comments on public.post_comments;
create trigger trg_post_comments after insert or delete on public.post_comments
  for each row execute function public.bump_comment_counter();
