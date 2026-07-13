-- In-app notifications for the community feed (AJA-96, polish under AJA-95).
-- A recipient sees an event when someone likes/comments on their post, votes on
-- their poll, or follows them. Rows are created ONLY by the security-definer
-- triggers below (there is no client insert policy) so one user cannot forge a
-- notification for another. Recipients read / mark-read / dismiss their own via
-- RLS, exactly like the rest of the community layer.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_handle text,
  actor_avatar text,
  kind text not null,                          -- 'like' | 'comment' | 'follow' | 'vote'
  post_id uuid references public.posts(id) on delete cascade,
  preview text,                                -- comment snippet / poll option / post caption
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (recipient_id) where not read;

alter table public.notifications enable row level security;
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select using (auth.uid() = recipient_id);
drop policy if exists "update own notifications" on public.notifications;
create policy "update own notifications" on public.notifications
  for update using (auth.uid() = recipient_id);
drop policy if exists "delete own notifications" on public.notifications;
create policy "delete own notifications" on public.notifications
  for delete using (auth.uid() = recipient_id);
-- (no insert policy: only the security-definer triggers below write rows)

-- There is no profiles table — the app denormalizes author name/handle/avatar
-- into posts / post_comments. Do the same for the actor of a like / vote /
-- follow so the trigger has a display identity to copy (comments already carry
-- author_* columns).
alter table public.post_likes add column if not exists actor_name text;
alter table public.post_likes add column if not exists actor_handle text;
alter table public.post_likes add column if not exists actor_avatar text;
alter table public.poll_votes add column if not exists actor_name text;
alter table public.poll_votes add column if not exists actor_handle text;
alter table public.poll_votes add column if not exists actor_avatar text;
alter table public.follows add column if not exists actor_name text;
alter table public.follows add column if not exists actor_handle text;
alter table public.follows add column if not exists actor_avatar text;

-- One shared trigger function, branching on the source table — mirrors the
-- existing bump_post_counter() convention.
create or replace function public.create_notification()
returns trigger language plpgsql security definer as $$
declare
  v_recipient uuid;
  v_actor uuid;
  v_actor_name text;
  v_actor_handle text;
  v_actor_avatar text;
  v_kind text;
  v_post_id uuid;
  v_preview text;
  v_opts text[];
begin
  if TG_TABLE_NAME = 'post_likes' then
    v_kind := 'like';
    v_post_id := NEW.post_id;
    v_actor := NEW.user_id;
    v_actor_name := NEW.actor_name;
    v_actor_handle := NEW.actor_handle;
    v_actor_avatar := NEW.actor_avatar;
    select author_id, caption into v_recipient, v_preview
      from public.posts where id = NEW.post_id;

  elsif TG_TABLE_NAME = 'post_comments' then
    v_kind := 'comment';
    v_post_id := NEW.post_id;
    v_actor := NEW.user_id;
    v_actor_name := NEW.author_name;
    v_actor_handle := NEW.author_handle;
    v_actor_avatar := NEW.author_avatar;
    v_preview := left(NEW.body, 140);
    select author_id into v_recipient from public.posts where id = NEW.post_id;

  elsif TG_TABLE_NAME = 'poll_votes' then
    v_kind := 'vote';
    v_post_id := NEW.post_id;
    v_actor := NEW.user_id;
    v_actor_name := NEW.actor_name;
    v_actor_handle := NEW.actor_handle;
    v_actor_avatar := NEW.actor_avatar;
    select author_id, poll_options into v_recipient, v_opts
      from public.posts where id = NEW.post_id;
    if v_opts is not null and array_length(v_opts, 1) >= NEW.option_idx + 1 then
      v_preview := v_opts[NEW.option_idx + 1];   -- Postgres arrays are 1-based
    end if;

  elsif TG_TABLE_NAME = 'follows' then
    v_kind := 'follow';
    v_post_id := null;
    v_actor := NEW.follower_id;
    v_actor_name := NEW.actor_name;
    v_actor_handle := NEW.actor_handle;
    v_actor_avatar := NEW.actor_avatar;
    v_recipient := NEW.following_id;
  end if;

  -- recipient gone (post deleted mid-flight) or self-action → nothing to notify
  if v_recipient is null or v_recipient = v_actor then
    return null;
  end if;

  -- Likes and follows can be toggled off/on repeatedly; collapse to one row per
  -- (recipient, actor, kind, post) so that doesn't pile up. Comments and votes
  -- are each distinct, meaningful events, so they are never deduped.
  if v_kind in ('like', 'follow') then
    if exists (
      select 1 from public.notifications n
      where n.recipient_id = v_recipient
        and n.actor_id = v_actor
        and n.kind = v_kind
        and n.post_id is not distinct from v_post_id
    ) then
      return null;
    end if;
  end if;

  insert into public.notifications
    (recipient_id, actor_id, actor_name, actor_handle, actor_avatar, kind, post_id, preview)
  values
    (v_recipient, v_actor, v_actor_name, v_actor_handle, v_actor_avatar, v_kind, v_post_id, v_preview);

  return null;
end; $$;

drop trigger if exists trg_notify_like on public.post_likes;
create trigger trg_notify_like after insert on public.post_likes
  for each row execute function public.create_notification();
drop trigger if exists trg_notify_comment on public.post_comments;
create trigger trg_notify_comment after insert on public.post_comments
  for each row execute function public.create_notification();
drop trigger if exists trg_notify_vote on public.poll_votes;
create trigger trg_notify_vote after insert on public.poll_votes
  for each row execute function public.create_notification();
drop trigger if exists trg_notify_follow on public.follows;
create trigger trg_notify_follow after insert on public.follows
  for each row execute function public.create_notification();
