/**
 * Closet ROI insights — turn the wear log + prices we already track into a
 * "is my wardrobe paying off?" view. Pure function over the item list.
 */

import type { Category, WardrobeItem } from "./types";
import { CATEGORY_LABEL } from "./types";

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

export interface CategorySlice {
  category: Category;
  label: string;
  count: number;
  pct: number;
}

export interface FullInsights extends ClosetInsights {
  /** Category breakdown for the donut, largest first. */
  categories: CategorySlice[];
  categoryCount: number;
  /** Average price across owned pieces that have a price. */
  avgPrice: number;
  /** Most recently added owned pieces (newest first). */
  recentlyAdded: WardrobeItem[];
  /** Most-worn owned pieces (highest wear count first). */
  mostWorn: WardrobeItem[];
}

/** Richer insights for the dedicated Insights screen. */
export function computeFullInsights(items: WardrobeItem[]): FullInsights {
  const base = computeInsights(items);
  const owned = items.filter((it) => !it.wishlist);

  const counts = new Map<Category, number>();
  for (const it of owned) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  const total = owned.length || 1;
  const categories: CategorySlice[] = [...counts.entries()]
    .map(([category, count]) => ({
      category,
      label: CATEGORY_LABEL[category],
      count,
      pct: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const priced = owned.filter((it) => typeof it.price === "number");
  const avgPrice = priced.length ? base.value / priced.length : 0;

  const recentlyAdded = [...owned]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);
  const mostWorn = [...owned]
    .filter((it) => (it.wearCount ?? 0) > 0)
    .sort((a, b) => (b.wearCount ?? 0) - (a.wearCount ?? 0))
    .slice(0, 5);

  return {
    ...base,
    categories,
    categoryCount: counts.size,
    avgPrice,
    recentlyAdded,
    mostWorn,
  };
}
