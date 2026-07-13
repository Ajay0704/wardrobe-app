-- In-app chat / direct messages (AJA-110). Private, participant-only threads with
-- 1:1 + group support, a public profiles directory for username search, and
-- block/report safety tables. Follows the community migration conventions:
-- security-definer helpers with a fixed search_path, "public read / self write"
-- where appropriate, and counter/preview kept by triggers.

-- ---------------------------------------------------------------- profiles
-- Public directory (first real profiles table). Powers username search and gives
-- messages a place to resolve a recipient's identity.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  updated_at timestamptz not null default now()
);
create index if not exists profiles_username_idx on public.profiles (lower(username));
create index if not exists profiles_display_idx on public.profiles (lower(display_name));
alter table public.profiles enable row level security;
drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select using (true);
drop policy if exists "upsert own profile" on public.profiles;
create policy "upsert own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (auth.uid() = id);

-- ---------------------------------------------------------------- conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,                                  -- groups only
  created_by uuid references auth.users(id) on delete set null,
  dm_key text unique,                          -- null for groups; sorted "idA:idB" for 1:1
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now()
);
create index if not exists conversations_last_msg_idx on public.conversations (last_message_at desc);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists cp_user_idx on public.conversation_participants (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text,
  sender_handle text,
  sender_avatar text,
  kind text not null default 'text',           -- text | image | outfit | item | look
  body text,
  payload jsonb,                               -- self-contained snapshot for shared content
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------- safety
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists "read own blocks" on public.blocks;
create policy "read own blocks" on public.blocks for select using (auth.uid() = blocker_id);
drop policy if exists "block self" on public.blocks;
create policy "block self" on public.blocks for insert with check (auth.uid() = blocker_id);
drop policy if exists "unblock self" on public.blocks;
create policy "unblock self" on public.blocks for delete using (auth.uid() = blocker_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  message_id uuid,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "insert own reports" on public.reports;
create policy "insert own reports" on public.reports for insert with check (auth.uid() = reporter_id);
drop policy if exists "read own reports" on public.reports;
create policy "read own reports" on public.reports for select using (auth.uid() = reporter_id);

-- ---------------------------------------------------------------- helpers
-- Non-recursive membership check: owned by the migration role, so its inner query
-- bypasses RLS and the conversation_participants policy is never re-evaluated.
create or replace function public.is_member(conv uuid, uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv and user_id = uid
  );
$$;

-- Bidirectional block check (either party blocked the other).
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------------------------------------------------------------- RLS (participant-only)
alter table public.conversations enable row level security;
drop policy if exists "read member conversations" on public.conversations;
create policy "read member conversations" on public.conversations for select
  using (public.is_member(id, auth.uid()));
drop policy if exists "create conversations" on public.conversations;
create policy "create conversations" on public.conversations for insert
  with check (auth.uid() = created_by);
drop policy if exists "update member conversations" on public.conversations;
create policy "update member conversations" on public.conversations for update
  using (public.is_member(id, auth.uid()));

alter table public.conversation_participants enable row level security;
drop policy if exists "read members" on public.conversation_participants;
create policy "read members" on public.conversation_participants for select
  using (public.is_member(conversation_id, auth.uid()));
drop policy if exists "add participants" on public.conversation_participants;
create policy "add participants" on public.conversation_participants for insert
  with check (auth.uid() = user_id or public.is_member(conversation_id, auth.uid()));
drop policy if exists "update own membership" on public.conversation_participants;
create policy "update own membership" on public.conversation_participants for update
  using (user_id = auth.uid());
drop policy if exists "leave conversation" on public.conversation_participants;
create policy "leave conversation" on public.conversation_participants for delete
  using (user_id = auth.uid());

alter table public.messages enable row level security;
drop policy if exists "read member messages" on public.messages;
create policy "read member messages" on public.messages for select
  using (public.is_member(conversation_id, auth.uid())
         and not public.is_blocked_between(auth.uid(), sender_id));
drop policy if exists "send member messages" on public.messages;
create policy "send member messages" on public.messages for insert
  with check (public.is_member(conversation_id, auth.uid()) and sender_id = auth.uid());
drop policy if exists "delete own messages" on public.messages;
create policy "delete own messages" on public.messages for delete
  using (sender_id = auth.uid());

-- ---------------------------------------------------------------- RPCs
-- Atomic conversation creation: solves participant-insert ordering (definer bypasses
-- RLS) and 1:1 dedupe race (dm_key unique + on conflict). p_participants excludes caller.
create or replace function public.create_or_get_conversation(
  p_participants uuid[], p_is_group boolean, p_title text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  all_ids uuid[];
  k text;
  conv uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  all_ids := array(select distinct unnest(array_append(p_participants, me)));

  if not p_is_group and array_length(all_ids, 1) = 2 then
    if exists (select 1 from unnest(p_participants) x
               where public.is_blocked_between(me, x)) then
      raise exception 'blocked';
    end if;
    select string_agg(x::text, ':' order by x) into k from unnest(all_ids) x;
    select id into conv from public.conversations
      where is_group = false and dm_key = k limit 1;
    if conv is not null then return conv; end if;
    insert into public.conversations (is_group, created_by, dm_key)
      values (false, me, k)
      on conflict (dm_key) do update set dm_key = excluded.dm_key
      returning id into conv;
  else
    insert into public.conversations (is_group, created_by, title)
      values (true, me, p_title) returning id into conv;
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
    select conv, x from unnest(all_ids) x
    on conflict do nothing;
  return conv;
end; $$;

-- Username/display-name search, excluding blocked+blocking users (both directions).
create or replace function public.search_users(q text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql security definer set search_path = public stable as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where p.id <> auth.uid()
    and coalesce(trim(q), '') <> ''
    and (p.username ilike '%' || q || '%' or p.display_name ilike '%' || q || '%')
    and not public.is_blocked_between(auth.uid(), p.id)
  order by p.username
  limit 20;
$$;

-- ---------------------------------------------------------------- trigger
-- Keep conversations.last_message_at / preview in sync as messages arrive.
create or replace function public.bump_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
declare preview text;
begin
  preview := case NEW.kind
    when 'text'   then left(coalesce(NEW.body, ''), 140)
    when 'image'  then 'Sent a photo'
    when 'outfit' then 'Shared an outfit'
    when 'item'   then 'Shared an item'
    when 'look'   then 'Shared a look'
    else left(coalesce(NEW.body, ''), 140)
  end;
  update public.conversations
    set last_message_at = NEW.created_at, last_message_preview = preview
    where id = NEW.conversation_id;
  return null;
end; $$;

drop trigger if exists trg_bump_conversation on public.messages;
create trigger trg_bump_conversation after insert on public.messages
  for each row execute function public.bump_conversation();
