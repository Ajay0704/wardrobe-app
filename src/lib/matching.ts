/**
 * Outfit suggestion engine. Pure functions over the item collection so the
 * logic is easy to unit test and to move server-side later.
 */

import { scoreOutfit, scorePair } from "./color";
import type { Season, SlotKey, WardrobeItem } from "./types";

export interface GenerateOptions {
  /** Anchor the outfit around this item (always included). */
  anchor?: WardrobeItem;
  /** Prefer items carrying this tag/vibe ("casual", "work", ...). */
  vibe?: string;
  /** Prefer items suitable for this season. */
  season?: Season | "all";
  /** Randomness source, injectable for tests. */
  random?: () => number;
}

/** How well an item fits the requested vibe/season, 0-1. */
function contextAffinity(
  item: WardrobeItem,
  vibe: string | undefined,
  season: Season | "all" | undefined,
): number {
  let score = 0.5;
  if (vibe) score += item.tags.includes(vibe) ? 0.35 : -0.2;
  if (season && season !== "all") {
    score += item.seasons.includes(season) ? 0.15 : -0.25;
  }
  return Math.max(0, Math.min(1, score));
}

function pickWeighted<T>(
  candidates: { value: T; weight: number }[],
  random: () => number,
): T | undefined {
  const total = candidates.reduce((s, c) => s + Math.max(c.weight, 0.01), 0);
  if (total <= 0 || candidates.length === 0) return undefined;
  let roll = random() * total;
  for (const c of candidates) {
    roll -= Math.max(c.weight, 0.01);
    if (roll <= 0) return c.value;
  }
  return candidates[candidates.length - 1]?.value;
}

/**
 * Generate an outfit draft. Strategy: decide dress vs top+bottom, then fill
 * each slot by sampling items weighted by (color harmony with what's already
 * picked) x (vibe/season affinity). Weighted sampling keeps results varied
 * across repeated clicks while still favoring good combinations.
 */
export function generateOutfit(
  items: WardrobeItem[],
  opts: GenerateOptions = {},
): Record<SlotKey, string[]> {
  const random = opts.random ?? Math.random;
  const draft: Record<SlotKey, string[]> = {
    top: [],
    bottom: [],
    dress: [],
    outerwear: [],
    shoes: [],
    accessories: [],
  };
  const picked: WardrobeItem[] = [];

  const place = (item: WardrobeItem) => {
    picked.push(item);
    if (item.category === "top") draft.top = [item.id];
    else if (item.category === "bottom") draft.bottom = [item.id];
    else if (item.category === "dress") draft.dress = [item.id];
    else if (item.category === "outerwear") draft.outerwear = [item.id];
    else if (item.category === "shoes") draft.shoes = [item.id];
    else draft.accessories = [...draft.accessories, item.id];
  };

  if (opts.anchor) place(opts.anchor);

  const harmonyWith = (item: WardrobeItem): number => {
    if (picked.length === 0) return 0.8;
    const worst = Math.min(
      ...picked.map((p) => scorePair(p.color, item.color).score),
    );
    return worst / 100;
  };

  const fill = (categories: WardrobeItem["category"][]) => {
    const candidates = items.filter(
      (it) =>
        categories.includes(it.category) &&
        !picked.some((p) => p.id === it.id),
    );
    const pick = pickWeighted(
      candidates.map((it) => ({
        value: it,
        weight:
          harmonyWith(it) ** 2 *
          contextAffinity(it, opts.vibe, opts.season),
      })),
      random,
    );
    if (pick) place(pick);
  };

  const hasDress = draft.dress.length > 0;
  const hasTopOrBottom = draft.top.length > 0 || draft.bottom.length > 0;
  const dressesAvailable = items.some((it) => it.category === "dress");
  const useDress =
    hasDress || (!hasTopOrBottom && dressesAvailable && random() < 0.3);

  if (useDress) {
    if (!hasDress) fill(["dress"]);
  } else {
    if (draft.top.length === 0) fill(["top"]);
    if (draft.bottom.length === 0) fill(["bottom"]);
  }
  if (draft.shoes.length === 0) fill(["shoes"]);
  // Outerwear ~half the time (always in winter), one accessory most times.
  if (draft.outerwear.length === 0 && (opts.season === "winter" || random() < 0.5)) {
    fill(["outerwear"]);
  }
  if (draft.accessories.length === 0 && random() < 0.75) {
    fill(["accessory", "bag"]);
  }

  return draft;
}

/** Convenience: overall harmony score for a set of items. */
export function outfitScore(items: WardrobeItem[]): number {
  return scoreOutfit(items.map((it) => it.color));
}
