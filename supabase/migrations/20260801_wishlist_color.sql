-- AJA-243: carry a real colour on wishlist saves.
--
-- Every wishlist add path stamped the placeholder #a8a29e, and analyzeSmartBuy decides
-- "you already own one of these" from similarColor(). AJA-242 stopped that placeholder
-- from producing false duplicate claims, which left duplicate detection inert for
-- wishlist items. This is the other half: give the saves a colour worth comparing.
--
-- The colour is computed where the bytes already exist (shop tone, detection crop, or
-- the fetched product image) and carried on the inbox row so the client's drain can
-- use it instead of the placeholder.

alter table public.wishlist_items
  add column if not exists color text;
