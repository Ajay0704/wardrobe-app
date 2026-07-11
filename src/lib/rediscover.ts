/**
 * Active rediscovery engine (AJA-37): given an item you own, assemble a few
 * complete outfits *from the rest of your closet* so under-worn pieces get
 * rediscovered. Pure + local (no API) — instant, free, and private. Reuses the
 * existing anchor-aware generator in matching.ts and the color harmony scoring.
 */

import { scorePair } from "./color";
import { generateOutfit, outfitScore } from "./matching";
import type { SlotKey, WardrobeItem } from "./types";
import { SLOT_CONFIG } from "./types";

export interface OutfitIdea {
  itemIds: string[];
  items: WardrobeItem[];
  /** Overall color-harmony score, 0-100. */
  score: number;
  /** Short human "why this works" line. */
  reason: string;
}

/** Flatten a builder draft into item ids in the canonical slot/layer order. */
function draftIds(draft: Record<SlotKey, string[]>): string[] {
  return SLOT_CONFIG.flatMap((s) => draft[s.key] ?? []);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function reasonFor(anchor: WardrobeItem, items: WardrobeItem[]): string {
  const others = items.filter((i) => i.id !== anchor.id);

  // Occasion: a tag the anchor shares with the outfit, else any tag present.
  const sharedTag =
    anchor.tags.find((t) => others.some((o) => o.tags.includes(t))) ??
    others.flatMap((o) => o.tags)[0];
  const occasion = sharedTag ? `${cap(sharedTag)} look` : "Everyday look";

  // Season the pieces have in common.
  const season = anchor.seasons.find((s) =>
    others.some((o) => o.seasons.includes(s)),
  );
  const seasonPhrase = season ? ` for ${season}` : "";

  // Harmony flavour from how the other colors relate to the anchor.
  const kinds = others.map((o) => scorePair(anchor.color, o.color).kind);
  let harmony: string;
  if (kinds.includes("neutral"))
    harmony = "neutral pieces keep it easy to wear";
  else if (kinds.includes("monochrome") || kinds.includes("analogous"))
    harmony = "tones that stay in the same family";
  else if (kinds.includes("complementary"))
    harmony = "a confident pop of contrast";
  else if (kinds.includes("triadic")) harmony = "a balanced, colourful mix";
  else harmony = "an unexpected pairing worth a try";

  return `${occasion}${seasonPhrase} — ${harmony}.`;
}

/**
 * Build up to `count` distinct outfit ideas anchored on `anchor`, drawn from the
 * user's owned items, ranked by color harmony. Returns fewer if the closet is
 * too small to form complete looks.
 */
export function styleWays(
  anchor: WardrobeItem,
  allItems: WardrobeItem[],
  count = 3,
  random: () => number = Math.random,
): OutfitIdea[] {
  const owned = allItems.filter((it) => !it.wishlist);
  const byId = new Map(owned.map((it) => [it.id, it]));
  const seen = new Set<string>();
  const ideas: OutfitIdea[] = [];

  // Oversample generations, then dedupe by item-set and keep the best-scoring.
  for (let i = 0; i < count * 10 && ideas.length < count * 3; i++) {
    const ids = draftIds(generateOutfit(owned, { anchor, random }));
    if (!ids.includes(anchor.id) || ids.length < 3) continue; // need a real look
    const key = [...ids].sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const items = ids
      .map((id) => byId.get(id))
      .filter((it): it is WardrobeItem => !!it);
    ideas.push({
      itemIds: ids,
      items,
      score: outfitScore(items),
      reason: reasonFor(anchor, items),
    });
  }

  return ideas.sort((a, b) => b.score - a.score).slice(0, count);
}

/**
 * Rank owned items by how "forgotten" they are — never/least worn first, then
 * oldest last-worn. Powers the "Rediscover your closet" spotlight.
 */
export function forgottenItems(
  allItems: WardrobeItem[],
  limit = 6,
): WardrobeItem[] {
  return allItems
    .filter((it) => !it.wishlist)
    .slice()
    .sort((a, b) => {
      const wa = a.wearCount ?? 0;
      const wb = b.wearCount ?? 0;
      if (wa !== wb) return wa - wb;
      // Tie-break: oldest last-worn (or never worn) first.
      return (a.lastWornAt ?? "").localeCompare(b.lastWornAt ?? "");
    })
    .slice(0, limit);
}
