/**
 * Closet ROI insights — turn the wear log + prices we already track into a
 * "is my wardrobe paying off?" view. Pure function over the item list.
 */

import type { WardrobeItem } from "./types";

export interface ClosetInsights {
  itemCount: number;
  /** Sum of owned item prices. */
  value: number;
  pricedCount: number;
  totalWears: number;
  /** % of owned pieces worn at least once (only meaningful once wears logged). */
  wornPct: number;
  /** Owned pieces never logged as worn. */
  neverWorn: WardrobeItem[];
  /** Lowest cost-per-wear owned piece (best value). */
  bestValue: { item: WardrobeItem; costPerWear: number } | null;
}

export function computeInsights(items: WardrobeItem[]): ClosetInsights {
  const owned = items.filter((it) => !it.wishlist);
  const value = owned.reduce((s, it) => s + (it.price ?? 0), 0);
  const pricedCount = owned.filter((it) => typeof it.price === "number").length;
  const totalWears = owned.reduce((s, it) => s + (it.wearCount ?? 0), 0);
  const wornItems = owned.filter((it) => (it.wearCount ?? 0) > 0);
  const wornPct = owned.length
    ? Math.round((wornItems.length / owned.length) * 100)
    : 0;
  const neverWorn = owned.filter((it) => !(it.wearCount ?? 0));

  let bestValue: ClosetInsights["bestValue"] = null;
  for (const it of owned) {
    if (typeof it.price === "number" && it.price > 0 && (it.wearCount ?? 0) > 0) {
      const costPerWear = it.price / (it.wearCount as number);
      if (!bestValue || costPerWear < bestValue.costPerWear) {
        bestValue = { item: it, costPerWear };
      }
    }
  }

  return {
    itemCount: owned.length,
    value,
    pricedCount,
    totalWears,
    wornPct,
    neverWorn,
    bestValue,
  };
}
