-- AJA-177: store the originating search query on each ingested product.
-- Lets catalog categories self-heal through the (fixed) ingest classifier, and
-- makes any future category re-derive lossless (title-primary + the real query)
-- instead of guessing from the title alone. Nullable; older rows stay null.
alter table public.shop_products
  add column if not exists source_query text;
