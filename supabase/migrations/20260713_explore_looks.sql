-- Explore content layer (AJA-93): outfit "looks" + editorial, gender-aware.
-- The feed shifts from a product catalogue to content-first ideas.

-- Gender on products so we can compose gender-consistent looks and filter.
alter table public.products add column if not exists gender text; -- 'male' | 'female' | 'unisex'

-- The content feed. A row is one feed card:
--   kind 'look'      -> a styled outfit; product_ids are its pieces (collage)
--   kind 'editorial' -> a lifestyle/inspiration image; hero_image set
--   kind 'product'   -> a single trending product; product_ids = [one id]
create table if not exists public.looks (
  id text primary key,
  seq bigint generated always as identity,
  kind text not null default 'look',
  gender text not null default 'unisex',   -- 'male' | 'female' | 'unisex'
  title text not null,
  subtitle text,
  vibes text[] not null default '{}',
  ratio numeric not null default 1.0,      -- height/width, drives masonry height
  hero_image text,                         -- editorial/product image (null for collages)
  product_ids text[] not null default '{}',
  saves integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists looks_seq_idx on public.looks (seq desc);
create index if not exists looks_gender_idx on public.looks (gender);
create index if not exists looks_kind_idx on public.looks (kind);
create index if not exists looks_vibes_idx on public.looks using gin (vibes);

alter table public.looks enable row level security;
drop policy if exists "Public read looks" on public.looks;
create policy "Public read looks" on public.looks for select using (true);
