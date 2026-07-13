-- Purchase import, Phase 1 (AJA-114). Flag-gated email-forward import: a trusted
-- cohort forwards order emails to a unique +token inbox; parsed line items are
-- STAGED for review (never written straight to the closet). Community-migration
-- conventions: idempotent, RLS, public read only where intended.

-- ---------------------------------------------------------------- cohort + routing
create table if not exists public.import_allow (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  inbox_token text unique,                 -- the +tag; nullable so it can be revoked
  verified_senders text[] not null default '{}',
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.import_allow enable row level security;
drop policy if exists "read own import_allow" on public.import_allow;
create policy "read own import_allow" on public.import_allow for select
  using (auth.uid() = user_id);
-- No client insert/update/delete: writes are service-role only (you add the cohort).

-- ---------------------------------------------------------------- staged candidates
create table if not exists public.import_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'email',    -- email | extension
  message_id text,                         -- Postmark MessageID (idempotency)
  sender text,                             -- forwarding From address (for held-sender confirm)
  name text,
  brand text,
  price numeric,
  product_url text,
  image_url text,                          -- durable Storage URL (captured at webhook) or null
  image_status text not null default 'ok', -- ok | unavailable
  category text,
  dedupe_key text,
  status text not null default 'pending',  -- pending | needs_verification | accepted | dismissed
  created_at timestamptz not null default now()
);
create index if not exists import_candidates_user_status_idx
  on public.import_candidates (user_id, status, created_at desc);
create index if not exists import_candidates_dedupe_idx
  on public.import_candidates (user_id, dedupe_key);
alter table public.import_candidates enable row level security;
drop policy if exists "read own candidates" on public.import_candidates;
create policy "read own candidates" on public.import_candidates for select
  using (auth.uid() = user_id);
drop policy if exists "update own candidates" on public.import_candidates;
create policy "update own candidates" on public.import_candidates for update
  using (auth.uid() = user_id);
drop policy if exists "delete own candidates" on public.import_candidates;
create policy "delete own candidates" on public.import_candidates for delete
  using (auth.uid() = user_id);
-- Insert is service-role only (the webhook).

-- ---------------------------------------------------------------- idempotency
create table if not exists public.import_processed (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.import_processed enable row level security;
-- No client policies: service-role only.

-- ---------------------------------------------------------------- RPCs (service-role callers use admin client; these are for the signed-in user)
-- Confirm a forwarding sender: add to verified_senders and release its held items.
create or replace function public.import_confirm_sender(p_sender text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.import_allow
    set verified_senders = (
      select array(select distinct unnest(array_append(verified_senders, lower(p_sender))))
    )
    where user_id = me;
  update public.import_candidates
    set status = 'pending'
    where user_id = me and status = 'needs_verification';
end; $$;

-- Delete all import data AND revoke the inbox (rotate token + disable) so the old
-- forward address stops working.
create or replace function public.import_wipe()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.import_candidates where user_id = me;
  delete from public.import_processed where user_id = me;
  update public.import_allow
    set inbox_token = 'revoked_' || substr(gen_random_uuid()::text, 1, 12),
        disabled = true
    where user_id = me;
end; $$;
