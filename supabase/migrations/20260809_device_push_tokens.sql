-- AJA-286: iOS APNs device tokens for the ageing-wishlist nudge (and future remote push).
-- Mirrors push_subscriptions (web): one row per device, user-scoped, service-role only.
-- The APNs host (sandbox vs production) is chosen server-side by $APNS_ENV, so no per-token
-- environment column is needed for v1 — a build is tested against one environment at a time.
create table if not exists public.device_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_id_idx
  on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;
-- No direct client policies — the API writes with the service role key.
