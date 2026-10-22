-- AJA-298: fixes from the 2026-10-17 security audit. Idempotent — safe to re-run.
--
-- Context that raises the stakes: anonymous sign-ins are ON, so "authenticated" means anyone who
-- holds the public anon key. Every hole below was reachable by a stranger with a guest session.

-- ---------------------------------------------------------------------------------------------
-- 1. Global per-user rate limiting for the paid API routes (src/lib/rate-limit.ts).
--    A fixed window counted in Postgres so the cap holds across serverless instances.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.api_rate_limits (
  key text primary key,
  n integer not null,
  reset_at timestamptz not null
);
alter table public.api_rate_limits enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) reads or writes this table.
revoke all on public.api_rate_limits from anon, authenticated;

create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.api_rate_limits;
begin
  insert into public.api_rate_limits as t (key, n, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set n = case when t.reset_at <= now() then 1 else t.n + 1 end,
        reset_at = case when t.reset_at <= now()
                        then now() + make_interval(secs => p_window_seconds)
                        else t.reset_at end
  returning * into r;

  -- Keep the table small without a cron: occasionally drop windows that ended over a day ago.
  if random() < 0.01 then
    delete from public.api_rate_limits where reset_at < now() - interval '1 day';
  end if;

  allowed := r.n <= p_limit;
  hits := r.n;
  retry_after := greatest(1, ceil(extract(epoch from (r.reset_at - now())))::integer);
  return next;
end;
$$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Chat: a user could insert THEMSELVES into any conversation whose id they knew
--    (check was `auth.uid() = user_id OR is_member(...)`), then read and post in it. The UPDATE
--    policy also let a participant rewrite conversation_id. Conversations are created by the
--    SECURITY DEFINER create_or_get_conversation(), which bypasses RLS, and the client only ever
--    updates last_read_at — so: only existing members may add people, and only last_read_at is
--    updatable.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "add participants" on public.conversation_participants;
drop policy if exists "members add participants" on public.conversation_participants;
create policy "members add participants" on public.conversation_participants
  for insert to authenticated
  with check (public.is_member(conversation_id, auth.uid()));

revoke update on public.conversation_participants from anon, authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Trips / shared closets: the member UPDATE policies had no WITH CHECK, so anyone ever invited
--    could repoint their membership row at another trip/closet id with status 'joined' and then
--    read and edit it. They could also rewrite their own role. Members legitimately update only
--    status and their display fields; owners manage the rest. Rows can never move.
--    (auth.uid() is null for the service role and internal triggers — those are trusted.)
-- ---------------------------------------------------------------------------------------------
create or replace function public.guard_trip_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.trip_id is distinct from old.trip_id or new.user_id is distinct from old.user_id then
    raise exception 'A trip membership cannot be moved to another trip or person.'
      using errcode = '42501';
  end if;
  if not public.is_trip_owner(old.trip_id, auth.uid()) and (
       new.role is distinct from old.role
    or new.invited_by is distinct from old.invited_by
    or new.inviter_name is distinct from old.inviter_name
    or new.inviter_handle is distinct from old.inviter_handle
    or new.inviter_avatar is distinct from old.inviter_avatar
  ) then
    raise exception 'Only the trip owner can change a member''s role or invite details.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_trip_member_update on public.trip_members;
create trigger guard_trip_member_update
  before update on public.trip_members
  for each row execute function public.guard_trip_member_update();

create or replace function public.guard_closet_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.closet_id is distinct from old.closet_id or new.user_id is distinct from old.user_id then
    raise exception 'A closet membership cannot be moved to another closet or person.'
      using errcode = '42501';
  end if;
  if not public.is_closet_owner(old.closet_id, auth.uid()) and (
       new.role is distinct from old.role
    or new.invited_by is distinct from old.invited_by
    or new.inviter_name is distinct from old.inviter_name
    or new.inviter_handle is distinct from old.inviter_handle
    or new.inviter_avatar is distinct from old.inviter_avatar
  ) then
    raise exception 'Only the closet owner can change a member''s role or invite details.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_closet_member_update on public.shared_closet_members;
create trigger guard_closet_member_update
  before update on public.shared_closet_members
  for each row execute function public.guard_closet_member_update();

revoke all on function public.guard_trip_member_update() from public, anon, authenticated;
revoke all on function public.guard_closet_member_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Storage: "Public read wardrobe images" was a SELECT policy for everyone, which let a
--    logged-out visitor LIST every user's folder (950 photos). Public URLs don't need it — the
--    bucket is public, and /object/public/... is served without RLS. Owners keep read access to
--    their own folder (which delete also relies on).
-- ---------------------------------------------------------------------------------------------
drop policy if exists "Public read wardrobe images" on storage.objects;
drop policy if exists "Users read own wardrobe images" on storage.objects;
create policy "Users read own wardrobe images" on storage.objects
  for select to authenticated
  using (bucket_id = 'wardrobe-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------
-- 5. Leftovers from the dropped username login (no migration created them; nothing calls them).
--    email_for_username() is SECURITY DEFINER and returned emails to anyone — empty today, but a
--    loaded gun. Revoke rather than drop so nothing is lost.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'email_for_username') then
    execute 'revoke all on function public.email_for_username(text) from public, anon, authenticated';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'username_available') then
    execute 'revoke all on function public.username_available(text) from public, anon, authenticated';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. metabase_ro (reporting login role created outside migrations) could read every private DM.
--    Analytics doesn't need message bodies; keep its other read policies.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "metabase_ro select messages" on public.messages;
drop policy if exists "metabase_ro select conversations" on public.conversations;

-- ---------------------------------------------------------------------------------------------
-- 7. Closet shares: anyone could list every share (owner name + items) and insert replies directly.
--    Both API routes use the service role, so these public policies were unused attack surface.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "Public read closet shares" on public.closet_shares;
drop policy if exists "Public read closet share replies" on public.closet_share_replies;
drop policy if exists "Public insert closet share replies" on public.closet_share_replies;

-- ---------------------------------------------------------------------------------------------
-- 8. Pin search_path on the functions that lacked it (advisor: function_search_path_mutable).
--    Every object they touch lives in public (incl. the vector extension).
-- ---------------------------------------------------------------------------------------------
alter function public.bump_post_counter() set search_path = public;
alter function public.bump_comment_counter() set search_path = public;
alter function public.create_notification() set search_path = public;
alter function public.match_similar(halfvec, text, uuid[], integer) set search_path = public;
alter function public.match_complements(halfvec, text, uuid[], integer) set search_path = public;
alter function public.touch_trips_updated_at() set search_path = public;
alter function public.touch_shared_closet_ts() set search_path = public;
alter function public.touch_styling_piece_ts() set search_path = public;
