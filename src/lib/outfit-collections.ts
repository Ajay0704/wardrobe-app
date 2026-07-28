/**
 * Derived collections for the looks library (AJA-239). Outfits carry no occasion/season
 * metadata of their own, but the items inside them already do (`formality`, `seasons`) and
 * the wear counters are maintained by `logWear` — so every collection here is computed, not
 * tagged. Nothing for the user to maintain, and no new model fields beyond `favorite`.
 *
 * Mirrors `presentSubcategories` in types.ts: only collections that actually match something
 * are offered as chips, so the row never shows a dead filter.
 */
import type { Outfit, WardrobeItem } from "./types";

export type CollectionKey =
  | "all"
  | "favorites"
  | "work"
  | "casual"
  | "warm"
  | "cold"
  | "never"
  | "recent";

export interface Collection {
  key: CollectionKey;
  label: string;
}

const COLLECTIONS: Collection[] = [
  { key: "all", label: "All" },
  { key: "favorites", label: "Favourites" },
  { key: "work", label: "Work" },
  { key: "casual", label: "Casual" },
  { key: "warm", label: "Warm" },
  { key: "cold", label: "Cold" },
  { key: "recent", label: "Recently worn" },
  { key: "never", label: "Never worn" },
];

/** Formality values that read as "dressed up" vs "dressed down" (item.formality is free-form). */
const WORK_FORMALITY = /formal|smart|business|office/i;
const CASUAL_FORMALITY = /casual|relaxed|sport|lounge/i;

const RECENT_DAYS = 30;

function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Does any member item match the predicate? */
function anyItem(
  outfit: Outfit,
  items: WardrobeItem[],
  pred: (it: WardrobeItem) => boolean,
): boolean {
  return outfit.itemIds.some((id) => {
    const it = items.find((x) => x.id === id);
    return !!it && pred(it);
  });
}

/** Is this look in the given collection? */
export function inCollection(
  key: CollectionKey,
  outfit: Outfit,
  items: WardrobeItem[],
): boolean {
  switch (key) {
    case "all":
      return true;
    case "favorites":
      return !!outfit.favorite;
    case "work":
      return anyItem(outfit, items, (it) => WORK_FORMALITY.test(it.formality ?? ""));
    case "casual":
      return anyItem(outfit, items, (it) => CASUAL_FORMALITY.test(it.formality ?? ""));
    case "warm":
      return anyItem(outfit, items, (it) => it.seasons?.includes("summer"));
    case "cold":
      return anyItem(outfit, items, (it) => it.seasons?.includes("winter"));
    case "never":
      return !outfit.wearCount;
    case "recent": {
      const d = daysSince(outfit.lastWornAt);
      return d !== null && d <= RECENT_DAYS;
    }
    default:
      return true;
  }
}

/** The collections worth showing as chips — "All" plus any with at least one match. */
export function presentCollections(
  outfits: Outfit[],
  items: WardrobeItem[],
): { collection: Collection; count: number }[] {
  return COLLECTIONS.map((collection) => ({
    collection,
    count: outfits.filter((o) => inCollection(collection.key, o, items)).length,
  })).filter(({ collection, count }) => collection.key === "all" || count > 0);
}

/** Free-text match over the look's name and the names/brands of its pieces. */
export function matchesQuery(
  outfit: Outfit,
  items: WardrobeItem[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (outfit.name.toLowerCase().includes(q)) return true;
  return outfit.itemIds.some((id) => {
    const it = items.find((x) => x.id === id);
    if (!it) return false;
    return (
      it.name.toLowerCase().includes(q) ||
      (it.brand ?? "").toLowerCase().includes(q) ||
      (it.category ?? "").toLowerCase().includes(q)
    );
  });
}

/** "Worn 4× · in April" / "Never worn" — the library's honest replacement for the fake score. */
export function wearSummary(outfit: Outfit): string {
  const n = outfit.wearCount ?? 0;
  if (!n) return "Never worn";
  const d = daysSince(outfit.lastWornAt);
  let when = "";
  if (d !== null) {
    if (d <= 0) when = "today";
    else if (d === 1) when = "yesterday";
    else if (d < 7) when = `${d} days ago`;
    else if (d < 14) when = "last week";
    else if (d < 60) when = `${Math.floor(d / 7)} weeks ago`;
    else when = `${Math.floor(d / 30)} months ago`;
  }
  return when ? `Worn ${n}× · ${when}` : `Worn ${n}×`;
}
