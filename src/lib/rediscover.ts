/**
 * Active rediscovery engine (AJA-37): given an item you own, assemble a few
 * complete outfits *from the rest of your closet* so under-worn pieces get
 * rediscovered. Pure + local (no API) — instant, free, and private. Reuses the
 * existing anchor-aware generator in matching.ts and the color harmony scoring.
 */

import { scorePair } from "./color";
import { suggestLooks } from "./matching";
import type { ResolvedContext } from "./style-context";
import type { WardrobeItem } from "./types";

export interface OutfitIdea {
  itemIds: string[];
  items: WardrobeItem[];
  /** Overall color-harmony score, 0-100. */
  score: number;
  /** Short human "why this works" line. */
  reason: string;
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
  /**
   * AJA-258 — resolved ambient context. Optional, and omitting it reproduces the
   * old behaviour exactly: NO season and NO temperature, which is why Rediscover
   * could offer a knit scarf in July. Callers with a conversational or explicit
   * context of their own (the stylist) deliberately pass nothing.
   */
  ctx?: ResolvedContext,
): OutfitIdea[] {
  void random;
  const owned = allItems.filter((it) => !it.wishlist);
  return suggestLooks(owned, {
    anchors: [anchor],
    count,
    candidates: count * 10,
    mood: anchor.tags[0] || "everyday",
    ...(ctx ? { weather: ctx.weather, season: ctx.season, occasion: ctx.occasion, vibe: ctx.vibe } : {}),
  })
    .filter((look) => look.itemIds.includes(anchor.id) && look.items.length >= 3)
    .map((look) => ({
      itemIds: look.itemIds,
      items: look.items,
      score: look.score,
      reason: look.reasons[0] || reasonFor(anchor, look.items),
    }));
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
