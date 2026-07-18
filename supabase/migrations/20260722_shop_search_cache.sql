-- Shop web-search query cache (AJA-172).
-- SerpAPI (engine=google_shopping) is metered, so /api/shop/search remembers each
-- (normalized query, page offset) -> the shop_products ids it produced, for a day.
-- Repeat searches serve from here instead of spending a SerpAPI credit. The route
-- treats this table as optional (defensive try/catch): search still works if it's
-- absent, just without the cost savings.

create table if not exists public.shop_search_cache (
  query_norm  text        not null,
  start       int         not null default 0,
  product_ids uuid[]      not null default '{}',
  fetched_at  timestamptz not null default now(),
  primary key (query_norm, start)
);

create index if not exists shop_search_cache_fetched_idx
  on public.shop_search_cache (fetched_at);

-- Service-role only (the search route uses the admin client); no anon/auth access.
alter table public.shop_search_cache enable row level security;
