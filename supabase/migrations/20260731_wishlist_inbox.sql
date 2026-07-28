-- Wishlist inbox (AJA-241) — make saves from Shop and detected photos actually arrive.
--
-- THE BUG: /api/wishlist inserts into wishlist_items and NOTHING in the app ever
-- selects from it. One insert, zero readers. The wishlist a user sees is
-- WardrobeItem.wishlist inside the per-user wardrobe_snapshots blob, so every heart
-- tapped on a shop result or a detected garment silently disappeared.
--
-- THE FIX: treat this table as a server-side INBOX the client drains, which is the
-- pattern sync.ts already uses for extension clips (absorbWishlistClips). This
-- migration adds what draining needs:
--
--   consumed_at  — set once the client has folded the row into its snapshot. Without
--                  it, deleting the absorbed item locally would resurrect it on the
--                  next sync. (absorbWishlistClips has exactly that hazard today and
--                  only dodges it by matching normalized product URLs.)
--   price_cents  — the wishlist renders a price; a save that loses it is half a save.
--   currency     — price_cents is meaningless without it.
--   product_url  — so "Open product page" works on an absorbed item.
--
-- No RLS change needed: the existing "own wishlist" policy is FOR ALL on
-- auth.uid() = user_id, so a user can already select and update their own rows.

alter table public.wishlist_items
  add column if not exists consumed_at timestamptz,
  add column if not exists price_cents integer,
  add column if not exists currency text,
  add column if not exists product_url text;

-- The drain query is "my rows, not yet consumed, oldest first".
create index if not exists wishlist_items_inbox_idx
  on public.wishlist_items (user_id, consumed_at, created_at);

-- Rows that predate this migration were never readable by any client, so there is no
-- way for the user to have seen or deleted them — they are safe to leave unconsumed
-- and let the client absorb on next sync. Deliberately NOT backfilling consumed_at:
-- that would silently discard the saves this migration exists to recover.
