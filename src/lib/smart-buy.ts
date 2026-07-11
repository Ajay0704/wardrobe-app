/**
 * "Smart Buy" — analyze a wishlist item against the pieces you already own,
 * before you spend. Pure functions over the wardrobe, reusing the same color
 * harmony engine the outfit builder uses, so a good pairing here means a good
 * outfit there.
 */

import { hexToHsl, hueDistance, isNeutral, scorePair } from "./color";
import type { Category, WardrobeItem } from "./types";
import { CATEGORY_LABEL } from "./types";

/** Which categories a piece is worn alongside, for pairing counts. */
const COMPLEMENTS: Record<Category, Category[]> = {
  top: ["bottom", "shoes", "outerwear", "accessory", "bag"],
  bottom: ["top", "shoes", "outerwear", "accessory", "bag"],
  dress: ["shoes", "outerwear", "accessory", "bag"],
  outerwear: ["top", "bottom", "dress", "shoes"],
  shoes: ["top", "bottom", "dress", "outerwear"],
  bag: ["top", "bottom", "dress", "outerwear"],
  accessory: ["top", "bottom", "dress", "outerwear"],
};

/** Rough wears-per-year by category, for a cost-per-wear projection. */
const ANNUAL_WEARS: Record<Category, number> = {
  top: 40,
  bottom: 45,
  dress: 18,
  outerwear: 50,
  shoes: 60,
  bag: 70,
  accessory: 35,
};

const PAIR_THRESHOLD = 70; // matches the builder's "good match" cutoff

export interface PairMatch {
  item: WardrobeItem;
  score: number;
}

export interface SmartBuyResult {
  verdict: "buy" | "maybe" | "skip";
  verdictLabel: string;
  /** Owned pieces that pair well, best first. */
  pairsWith: PairMatch[];
  /** Rough number of new outfits the piece unlocks. */
  newOutfits: number;
  /** price / annual wears, or null when no price is set. */
  costPerWear: number | null;
  annualWears: number;
  /** Owned pieces in the same category with a very similar color. */
  redundant: WardrobeItem[];
  reasons: { tone: "good" | "warn" | "info"; text: string }[];
}

/** Two colors close enough that owning both is likely redundant. */
function similarColor(a: string, b: string): boolean {
  const ha = hexToHsl(a);
  const hb = hexToHsl(b);
  if (isNeutral(ha) && isNeutral(hb)) return Math.abs(ha.l - hb.l) < 22;
  return hueDistance(ha.h, hb.h) < 18 && Math.abs(ha.l - hb.l) < 26;
}

export function analyzeSmartBuy(
  item: WardrobeItem,
  allItems: WardrobeItem[],
): SmartBuyResult {
  const owned = allItems.filter((it) => !it.wishlist && it.id !== item.id);
  const cat = item.category;

  const pairsWith: PairMatch[] = owned
    .filter((o) => COMPLEMENTS[cat].includes(o.category))
    .map((o) => ({ item: o, score: scorePair(item.color, o.color).score }))
    .filter((p) => p.score >= PAIR_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const pairsIn = (cats: Category[]) =>
    pairsWith.filter((p) => cats.includes(p.item.category)).length;

  const shoeMult = Math.max(1, pairsIn(["shoes"]));
  let core = 0;
  if (cat === "top") core = pairsIn(["bottom"]);
  else if (cat === "bottom") core = pairsIn(["top"]);
  else if (cat === "dress") core = 1;
  else if (cat === "outerwear") core = pairsIn(["top", "dress"]);
  else core = pairsIn(["top", "dress"]); // shoes, bag, accessory
  const useShoeMult = cat === "top" || cat === "bottom" || cat === "dress";
  const newOutfits = Math.min(40, core * (useShoeMult ? shoeMult : 1));

  const annualWears = ANNUAL_WEARS[cat];
  const costPerWear =
    typeof item.price === "number" && item.price > 0
      ? Math.round((item.price / annualWears) * 100) / 100
      : null;

  const ownedSameCat = owned.filter((o) => o.category === cat);
  const redundant = ownedSameCat.filter((o) => similarColor(o.color, item.color));

  const catLabel = CATEGORY_LABEL[cat].toLowerCase();
  const reasons: SmartBuyResult["reasons"] = [];

  const fillsGap = ownedSameCat.length <= 1;
  if (fillsGap) {
    reasons.push({
      tone: "good",
      text:
        ownedSameCat.length === 0
          ? `Fills a gap — you don't own any ${catLabel} yet.`
          : `Rounds out a thin ${catLabel} rotation (you own just 1).`,
    });
  }
  if (pairsWith.length > 0) {
    reasons.push({
      tone: "good",
      text: `Pairs with ${pairsWith.length} piece${pairsWith.length > 1 ? "s" : ""} you already own.`,
    });
  }
  if (costPerWear !== null) {
    reasons.push({
      tone: "info",
      text: `At ~${annualWears} wears a year, about $${costPerWear.toFixed(2)} per wear.`,
    });
  }
  if (redundant.length > 0) {
    reasons.push({
      tone: "warn",
      text: `Close to ${redundant.length === 1 ? `“${redundant[0].name}”` : `${redundant.length} pieces`} you already own — may be redundant.`,
    });
  }
  if (pairsWith.length === 0) {
    reasons.push({
      tone: "warn",
      text: `Hard to style — nothing in your closet pairs cleanly with it yet.`,
    });
  }

  // Verdict score.
  let s = 0;
  if (ownedSameCat.length === 0) s += 2;
  else if (ownedSameCat.length === 1) s += 1;
  if (pairsWith.length >= 5) s += 2;
  else if (pairsWith.length >= 3) s += 1;
  else if (pairsWith.length === 0) s -= 2;
  if (redundant.length >= 1) s -= 2;

  const verdict = s >= 3 ? "buy" : s >= 1 ? "maybe" : "skip";
  const verdictLabel =
    verdict === "buy"
      ? "Worth buying"
      : verdict === "maybe"
        ? "Maybe"
        : "Think twice";

  return {
    verdict,
    verdictLabel,
    pairsWith,
    newOutfits,
    costPerWear,
    annualWears,
    redundant,
    reasons,
  };
}
