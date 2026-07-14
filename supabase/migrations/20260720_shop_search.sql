-- Closet-aware product search, Phase 1 (AJA-116). Adds the structured attribute
-- columns the search/pairing logic compares on, a full-text search vector for the
-- shippable keyword search mode, and re-seeds the outfit_compat weights idempotently.
--
-- REVIEW-ONLY: apply this yourself in the Supabase SQL editor. Idempotent — safe to
-- re-run. No new tables, no RLS changes: shop_products / outfit_compat stay public-read
-- (writes service-role only), and the closet is read from the existing per-user
-- wardrobe_snapshots row — so there is nothing new to lock down here.

-- ------------------------------------------------------- catalog attribute columns
-- Feeds may omit these, so all nullable. `attributes` jsonb stays the fallback source;
-- these promote the three axes the rule-based compatibility engine actually reads.
alter table public.shop_products add column if not exists fit text;        -- 'slim'|'straight'|'relaxed'|'wide'|'oversized'|...
alter table public.shop_products add column if not exists tone text;       -- colour group: 'neutral'|'warm'|'cool'|'black'|'white'|...
alter table public.shop_products add column if not exists formality text;  -- 'casual'|'smart-casual'|'formal'|'statement'|...

-- Best-effort backfill from the existing attributes jsonb (no-op when keys absent or
-- already populated). Never overwrites a set value.
update public.shop_products set fit       = attributes->>'fit'       where fit is null       and attributes ? 'fit';
update public.shop_products set tone      = attributes->>'tone'      where tone is null      and attributes ? 'tone';
update public.shop_products set formality = attributes->>'formality' where formality is null and attributes ? 'formality';

-- ------------------------------------------------------- keyword search (FTS)
-- Generated tsvector over brand + title + category → the default SEARCH_MODE=keyword
-- path. If generated-column FTS is ever undesirable, the endpoint falls back to ilike.
alter table public.shop_products
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('english',
      coalesce(brand, '') || ' ' || coalesce(title, '') || ' ' || coalesce(category, ''))
  ) stored;
create index if not exists shop_products_search_idx on public.shop_products using gin (search_tsv);

-- ------------------------------------------------------- compat weights (safety net)
-- outfit_compat already exists and is seeded by 20260717. Re-assert the table + the
-- pairs the pairing engine relies on, so this migration is self-contained.
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

alter table public.outfit_compat enable row level security;
drop policy if exists "read outfit_compat" on public.outfit_compat;
create policy "read outfit_compat" on public.outfit_compat for select using (true);
