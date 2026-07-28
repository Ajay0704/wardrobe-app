import { useWardrobe } from "./store";
import {
  fetchWishlistInbox,
  inboxToItems,
  markWishlistInboxConsumed,
} from "./supabase/sync";

/**
 * Pull any pending wishlist saves into the closet right now (AJA-241).
 *
 * AuthProvider drains the inbox on `visibilitychange`, which covers saves made by the
 * browser extension or on another device. It does NOT cover the common case: tapping
 * the heart inside this app never backgrounds it, so without this the save wouldn't
 * appear until the user happened to switch away and come back — which reads as the
 * bug still being there.
 *
 * Safe to call repeatedly: inboxToItems dedupes on row id and product URL, and
 * absorbItems skips ids it already has.
 */
export async function drainWishlistInbox(): Promise<number> {
  try {
    const rows = await fetchWishlistInbox();
    if (!rows.length) return 0;
    const { items, absorbItems } = useWardrobe.getState();
    const fresh = inboxToItems(rows, items);
    if (fresh.length) absorbItems(fresh);
    // Mark AFTER the store write, so a failure leaves the rows for another attempt.
    await markWishlistInboxConsumed(rows.map((r) => r.id));
    return fresh.length;
  } catch {
    return 0; // offline or signed out — the visibilitychange drain will retry
  }
}
