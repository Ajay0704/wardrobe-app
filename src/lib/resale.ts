/**
 * Resale loop (AJA-157, Phase 2) — referral-link implementation.
 *
 * We don't run a listing API yet; instead we surface the user's unworn pieces
 * with a rough resale estimate and deep-link them out to a marketplace's "sell"
 * flow (eBay / Poshmark / Vinted). This is the fast, no-partner-deal version of
 * the "Refresh your closet" concept — the loop that closes catalog → wear →
 * resell. A listing API can slot in later behind the same UI.
 */
import type { WardrobeItem } from "@/lib/types";

export interface ResalePlatform {
  id: string;
  name: string;
  /** Deep link into the platform's sell flow (seeded with the item where possible). */
  sellUrl: (item: WardrobeItem) => string;
}

const enc = (s: string) => encodeURIComponent(s.trim());

export const RESALE_PLATFORMS: ResalePlatform[] = [
  {
    id: "ebay",
    name: "eBay",
    // eBay's "start a listing" prelist, seeded with brand + name so it suggests a category.
    sellUrl: (it) =>
      `https://www.ebay.com/sl/prelist/suggest?keywords=${enc(
        [it.brand, it.name].filter(Boolean).join(" ") || "clothing",
      )}`,
  },
  { id: "poshmark", name: "Poshmark", sellUrl: () => "https://poshmark.com/create-listing" },
  { id: "vinted", name: "Vinted", sellUrl: () => "https://www.vinted.com/items/new" },
];

/** Category fallback estimates (USD) when the original price is unknown. */
const CATEGORY_BASE: Record<string, number> = {
  outerwear: 28,
  dress: 22,
  bag: 24,
  shoes: 20,
  bottom: 14,
  top: 9,
  accessory: 6,
};

/**
 * Rough resale estimate in USD. If we know the original price, secondhand tends
 * to fetch ~35% of it; otherwise fall back to a category default. Floored at $3.
 * Deliberately conservative and always labeled as an estimate in the UI.
 */
export function estimateResale(item: WardrobeItem): number {
  const base =
    typeof item.price === "number" && item.price > 0
      ? item.price * 0.35
      : (CATEGORY_BASE[item.category] ?? 10);
  return Math.max(3, Math.round(base));
}

const hasImage = (it: WardrobeItem) => Boolean(it.imageUrl || it.beautifiedImageUrl);

/**
 * Pieces worth reselling — never-worn first (the clearest "you don't wear this"),
 * falling back to barely-worn / long-unworn when there aren't enough never-worn.
 */
export function resaleCandidates(items: WardrobeItem[], limit = 8): WardrobeItem[] {
  const owned = items.filter((it) => !it.wishlist && hasImage(it));
  const neverWorn = owned.filter((it) => !(it.wearCount ?? 0));
  const pool = neverWorn.length >= 3 ? neverWorn : owned.filter((it) => (it.wearCount ?? 0) <= 1);
  return pool
    .slice()
    .sort(
      (a, b) =>
        (a.wearCount ?? 0) - (b.wearCount ?? 0) ||
        (a.lastWornAt ?? "").localeCompare(b.lastWornAt ?? ""),
    )
    .slice(0, limit);
}

export interface ResaleSummary {
  items: WardrobeItem[];
  /** Sum of per-item estimates (USD). */
  total: number;
}

export function resaleSummary(items: WardrobeItem[]): ResaleSummary {
  const list = resaleCandidates(items);
  return { items: list, total: list.reduce((s, it) => s + estimateResale(it), 0) };
}
