-- Tap-through photo-detail + shop (AJA-97, Slice 1). Backs hands-free garment
-- selection, the own/wishlist/shop writes, and the two endless product feeds
-- (Similar + Goes-with) with pgvector image embeddings.
--
-- EMBED_DIM = 768 (HF SigLIP). Named shop_products so it does NOT collide with
-- AJA-93's live `products` Explore catalog. Source references (which Explore
-- card / post a garment was grabbed from) are `text` because Explore card ids
-- are namespaced strings, not uuids.

create extension if not exists vector;

-- Buyable catalog, ingested from affiliate feeds; image embedded for vector search.
create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  source text not null,                        -- 'cj' | 'rakuten' | 'ebay' | 'dummyjson' | ...
  external_id text not null,                   -- id within that feed
  brand text,
  title text not null,
  category text not null,                      -- 'top'|'bottom'|'shoes'|'outerwear'|'dress'|'bag'|'accessory'
  price_cents int,
  currency text default 'USD',
  image_url text not null,
  buy_url text not null,                       -- affiliate deep link
  in_stock boolean default true,
  attributes jsonb default '{}',               -- color, material, pattern, fit
  embedding halfvec(768),                      -- image embedding
  updated_at timestamptz default now(),
  unique (source, external_id)
);
create index if not exists shop_products_embed_idx on public.shop_products using hnsw (embedding halfvec_cosine_ops);
create index if not exists shop_products_category_idx on public.shop_products (category);

-- Garments the user OWNS (built via "I own this").
create table if not exists public.garments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_ref text,                             -- Explore card / post it was grabbed from
  name text not null,
  category text not null,
  attributes jsonb default '{}',
  image_path text,                             -- segmented crop in Storage
  embedding halfvec(768),
  created_at timestamptz default now()
);
create index if not exists garments_embed_idx on public.garments using hnsw (embedding halfvec_cosine_ops);
create index if not exists garments_user_idx on public.garments (user_id);

-- Wishlist: pieces the user WANTS but does not own. Kept separate from garments
-- so owned-inventory data stays clean.
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                          -- 'pictured' (from a photo) | 'product' (a catalog item)
  product_id uuid references public.shop_products(id) on delete set null,
  name text,
  category text,
  image_url text,
  source_ref text,
  created_at timestamptz default now()
);
create index if not exists wishlist_items_user_idx on public.wishlist_items (user_id);

-- Persisted detections: box -> garment result keyed by id, so follow-up
-- similar/goes-with/own/wishlist calls reuse the embedding without re-running
-- the model. Read/written server-side (embedding never leaves the server).
create table if not exists public.detections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source_ref text,
  image_url text,
  box jsonb,                                   -- {x,y,w,h} normalized 0..1
  name text,
  category text,
  attributes jsonb default '{}',
  crop_path text,
  embedding halfvec(768),
  created_at timestamptz default now()
);
create index if not exists detections_user_idx on public.detections (user_id);

-- Outfit compatibility weights (drives "goes with"). Data-driven, editable.
create table if not exists public.outfit_compat (
  source_category text not null,
  target_category text not null,
  weight real not null default 1.0,
  primary key (source_category, target_category)
);
insert into public.outfit_compat (source_category, target_category, weight) values
  ('top','bottom',1.0),('top','shoes',0.8),('top','outerwear',0.7),('top','bag',0.5),('top','accessory',0.5),
  ('bottom','top',1.0),('bottom','shoes',0.9),('bottom','outerwear',0.6),('bottom','bag',0.5),
  ('shoes','bottom',0.9),('shoes','top',0.7),
  ('outerwear','top',0.8),('outerwear','bottom',0.7),('outerwear','shoes',0.6),
  ('dress','shoes',0.9),('dress','outerwear',0.7),('dress','bag',0.6),('dress','accessory',0.6),
  ('bag','top',0.5),('bag','dress',0.6),
  ('accessory','top',0.5),('accessory','dress',0.5)
on conflict (source_category, target_category) do update set weight = excluded.weight;

-- Event log: the moat. Every meaningful action, from day one.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  type text not null,                          -- 'view'|'grab'|'own'|'wishlist'|'shop_click'|'purchase'
  post_ref text,
  garment_id uuid,
  product_id uuid,
  payload jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists events_user_idx on public.events (user_id, created_at desc);
create index if not exists events_type_idx on public.events (type, created_at desc);

-- ------------------------------------------------------------------ RLS
alter table public.shop_products enable row level security;
alter table public.garments enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.detections enable row level security;
alter table public.outfit_compat enable row level security;
alter table public.events enable row level security;

drop policy if exists "read shop_products" on public.shop_products;
create policy "read shop_products" on public.shop_products for select using (true);
drop policy if exists "read outfit_compat" on public.outfit_compat;
create policy "read outfit_compat" on public.outfit_compat for select using (true);

drop policy if exists "own garments" on public.garments;
create policy "own garments" on public.garments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own wishlist" on public.wishlist_items;
create policy "own wishlist" on public.wishlist_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own detections" on public.detections;
create policy "own detections" on public.detections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "insert events" on public.events;
create policy "insert events" on public.events for insert with check (auth.uid() = user_id);
-- (shop_products / outfit_compat writes are service-role only — no client policy)

-- ------------------------------------------------------------------ vector RPCs
-- Similar: nearest products in the SAME category.
create or replace function public.match_similar(
  query_embedding halfvec(768),
  in_category text,
  exclude_ids uuid[] default '{}',
  match_count int default 10
) returns setof public.shop_products language sql stable as $$
  select * from public.shop_products
  where category = in_category
    and in_stock
    and not (id = any(exclude_ids))
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Goes with: complementary categories, ranked by compat weight then visual similarity.
create or replace function public.match_complements(
  query_embedding halfvec(768),
  in_category text,
  exclude_ids uuid[] default '{}',
  match_count int default 10
) returns setof public.shop_products language sql stable as $$
  select p.* from public.shop_products p
  join public.outfit_compat oc
    on oc.source_category = in_category
   and oc.target_category = p.category
  where p.in_stock
    and not (p.id = any(exclude_ids))
    and p.embedding is not null
  order by oc.weight desc, p.embedding <=> query_embedding
  limit match_count;
$$;
