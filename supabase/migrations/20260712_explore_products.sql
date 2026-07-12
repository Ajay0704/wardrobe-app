-- AJA-93: Explore real feed — external product catalog.
-- Populated by the ingestion cron from feed providers (eBay now; Skimlinks once
-- approved). No user content lives here — this is external online products only.
create table if not exists public.products (
  id text primary key,                 -- e.g. "ebay:v1|1234|0"
  seq bigint generated always as identity, -- monotonic; drives keyset pagination
  source text not null,                -- "ebay" | "skimlinks"
  title text not null,
  brand text,
  price numeric,
  currency text,
  image_url text not null,
  product_url text not null,           -- affiliate-wrapped buy link
  category text,                       -- normalized to our Category where possible
  colors text[] not null default '{}',
  vibe_tags text[] not null default '{}',
  in_stock boolean not null default true,
  saves integer not null default 0,    -- social proof / future ranking
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_seq_idx on public.products (seq desc);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_vibe_tags_idx on public.products using gin (vibe_tags);

alter table public.products enable row level security;

-- Public can read the feed (anon key). Writes happen only via the service role
-- in the ingestion cron, which bypasses RLS — so there is no insert/update policy.
drop policy if exists "Public read products" on public.products;
create policy "Public read products"
  on public.products for select
  using (true);
