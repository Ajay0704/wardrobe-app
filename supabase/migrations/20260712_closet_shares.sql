-- AJA: Share Closet — public link + guest replies (no app install required)
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

-- Public can read a share by id (guests open the link).
drop policy if exists "Public read closet shares" on public.closet_shares;
create policy "Public read closet shares"
  on public.closet_shares for select
  using (true);

-- Owners manage their shares (API also uses service role).
drop policy if exists "Owners insert closet shares" on public.closet_shares;
create policy "Owners insert closet shares"
  on public.closet_shares for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owners read own closet share replies" on public.closet_share_replies;
create policy "Owners read own closet share replies"
  on public.closet_share_replies for select
  using (
    exists (
      select 1 from public.closet_shares s
      where s.id = share_id and s.user_id = auth.uid()
    )
  );

-- Guests leave replies without an account.
drop policy if exists "Public insert closet share replies" on public.closet_share_replies;
create policy "Public insert closet share replies"
  on public.closet_share_replies for insert
  with check (true);

drop policy if exists "Public read closet share replies" on public.closet_share_replies;
create policy "Public read closet share replies"
  on public.closet_share_replies for select
  using (true);
