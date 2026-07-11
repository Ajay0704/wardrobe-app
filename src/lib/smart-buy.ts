/**
 * "Smart Buy" — analyze a wishlist item against the pieces you already own,
 * before you spend.
 *
 * Signals (v2):
 * - Color harmony (same engine as the outfit builder)
 * - Tag / occasion overlap + formal↔athleisure clash
 * - Season overlap
 * - Redundancy (similar color, or same category + shared tags)
 * - Cost-per-wear from closet wear history when available, else category average
 * - Boost when pairs with high-wear "workhorse" pieces
 */

import { hexToHsl, hueDistance, isNeutral, scorePair } from "./color";
import type { Category, Season, WardrobeItem } from "./types";
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

/** Fallback wears-per-year by category when the closet has no wear history. */
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

const FORMAL_TAGS = new Set(["formal", "work", "party", "date night"]);
const ATHLEISURE_TAGS = new Set(["athleisure"]);

export interface PairMatch {
  item: WardrobeItem;
  score: number;
}

export interface SmartBuyOptions {
  /** From onboarding / profile — boosts items that match how you dress. */
  styleVibes?: string[];
}

export interface SmartBuyResult {
  verdict: "buy" | "maybe" | "skip";
  verdictLabel: string;
  /** Owned pieces that pair well, best first. */
  pairsWith: PairMatch[];
  /** Rough number of new outfits the piece unlocks. */
  newOutfits: number;
  /** price / projected annual wears, or null when no price is set. */
  costPerWear: number | null;
  annualWears: number;
  /** Whether annual wears came from logged wears or category averages. */
  cpwBasis: "closet-history" | "category-average";
  /** Owned pieces that look redundant with this buy. */
  redundant: WardrobeItem[];
  reasons: { tone: "good" | "warn" | "info"; text: string }[];
}

/** Two colors close enough that owning both is likely redundant. */
function similarColor(a: string, b: string): boolean {
  try {
    const ha = hexToHsl(a || "#a8a29e");
    const hb = hexToHsl(b || "#a8a29e");
    if (isNeutral(ha) && isNeutral(hb)) return Math.abs(ha.l - hb.l) < 22;
    return hueDistance(ha.h, hb.h) < 18 && Math.abs(ha.l - hb.l) < 26;
  } catch {
    return false;
  }
}

function normTags(tags: string[] | undefined | null): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function sharedTags(a: string[], b: string[]): string[] {
  const setB = new Set(normTags(b));
  return normTags(a).filter((t) => setB.has(t));
}

function tagClash(a: string[], b: string[]): boolean {
  const na = new Set(normTags(a));
  const nb = new Set(normTags(b));
  const aFormal = [...na].some((t) => FORMAL_TAGS.has(t));
  const bFormal = [...nb].some((t) => FORMAL_TAGS.has(t));
  const aAth = [...na].some((t) => ATHLEISURE_TAGS.has(t));
  const bAth = [...nb].some((t) => ATHLEISURE_TAGS.has(t));
  // Gym-only vs formal-only rarely works; casual can still bridge.
  const aOnlyAth = aAth && ![...na].some((t) => FORMAL_TAGS.has(t) || t === "casual");
  const bOnlyAth = bAth && ![...nb].some((t) => FORMAL_TAGS.has(t) || t === "casual");
  const aOnlyFormal = aFormal && !na.has("casual") && !aAth;
  const bOnlyFormal = bFormal && !nb.has("casual") && !bAth;
  return (aOnlyAth && bOnlyFormal) || (bOnlyAth && aOnlyFormal);
}

function seasonsOverlap(
  a: Season[] | undefined | null,
  b: Season[] | undefined | null,
): boolean {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (!aa.length || !bb.length) return true; // unknown → don't penalize
  return aa.some((s) => bb.includes(s));
}

/**
 * Project annual wears: prefer average logged wears in the same category
 * (what you actually wear), clamped around the category baseline.
 */
export function projectedAnnualWears(
  category: Category,
  ownedSameCat: WardrobeItem[],
): { wears: number; basis: "closet-history" | "category-average" } {
  const baseline = ANNUAL_WEARS[category];
  const withWears = ownedSameCat.filter((o) => (o.wearCount ?? 0) > 0);
  if (withWears.length === 0) {
    return { wears: baseline, basis: "category-average" };
  }
  const avg =
    withWears.reduce((s, o) => s + (o.wearCount ?? 0), 0) / withWears.length;
  const wears = Math.round(
    Math.min(baseline * 1.6, Math.max(Math.round(baseline * 0.25), avg)),
  );
  return { wears, basis: "closet-history" };
}

/** Color score adjusted by tags, seasons, and style vibes. */
function compatibilityScore(
  candidate: WardrobeItem,
  owned: WardrobeItem,
  styleVibes: string[],
): number | null {
  if (tagClash(candidate.tags, owned.tags)) return null;
  if (!seasonsOverlap(candidate.seasons, owned.seasons)) return null;

  let score = scorePair(candidate.color, owned.color).score;
  const shared = sharedTags(candidate.tags, owned.tags);
  if (shared.length) score += Math.min(12, shared.length * 5);

  const vibes = normTags(styleVibes);
  if (vibes.length) {
    const ownedHit = normTags(owned.tags).some((t) => vibes.includes(t));
    const candHit = normTags(candidate.tags).some((t) => vibes.includes(t));
    if (ownedHit && candHit) score += 4;
  }

  // Workhorse bonus — pairing with pieces you actually wear is more valuable.
  const wears = owned.wearCount ?? 0;
  if (wears >= 10) score += 3;
  else if (wears >= 3) score += 1;
  if (owned.favorite) score += 2;

  return score;
}

export function analyzeSmartBuy(
  item: WardrobeItem,
  allItems: WardrobeItem[],
  opts: SmartBuyOptions = {},
): SmartBuyResult {
  const owned = (Array.isArray(allItems) ? allItems : []).filter(
    (it) => it && !it.wishlist && it.id !== item.id,
  );
  const cat = (item.category in COMPLEMENTS ? item.category : "top") as Category;
  const styleVibes = opts.styleVibes ?? [];

  const complements = COMPLEMENTS[cat] ?? COMPLEMENTS.top;

  const pairsWith: PairMatch[] = owned
    .filter((o) => complements.includes(o.category))
    .map((o) => {
      try {
        const score = compatibilityScore(item, o, styleVibes);
        return score === null ? null : { item: o, score };
      } catch {
        return null;
      }
    })
    .filter((p): p is PairMatch => p !== null && p.score >= PAIR_THRESHOLD)
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

  const ownedSameCat = owned.filter((o) => o.category === cat);
  const { wears: annualWears, basis: cpwBasis } = projectedAnnualWears(
    cat,
    ownedSameCat,
  );
  const costPerWear =
    typeof item.price === "number" && item.price > 0
      ? Math.round((item.price / annualWears) * 100) / 100
      : null;

  const redundant = ownedSameCat.filter((o) => {
    if (similarColor(o.color, item.color)) return true;
    // Same category + several shared occasion/style tags ≈ same role
    return sharedTags(o.tags, item.tags).length >= 2;
  });

  const redundantIds = new Set<string>();
  const redundantUnique = redundant.filter((o) => {
    if (redundantIds.has(o.id)) return false;
    redundantIds.add(o.id);
    return true;
  });
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
    const workhorses = pairsWith.filter((p) => (p.item.wearCount ?? 0) >= 5).length;
    reasons.push({
      tone: "good",
      text:
        workhorses > 0
          ? `Pairs with ${pairsWith.length} piece${pairsWith.length > 1 ? "s" : ""} you already own (${workhorses} you wear often).`
          : `Pairs with ${pairsWith.length} piece${pairsWith.length > 1 ? "s" : ""} you already own.`,
    });
  }
  if (costPerWear !== null) {
    reasons.push({
      tone: "info",
      text:
        cpwBasis === "closet-history"
          ? `Based on how often you wear ${catLabel}s (~${annualWears}×), about $${costPerWear.toFixed(2)} per wear.`
          : `At ~${annualWears} wears a year (category average), about $${costPerWear.toFixed(2)} per wear.`,
    });
  }
  if (styleVibes.length && normTags(item.tags).some((t) => normTags(styleVibes).includes(t))) {
    reasons.push({
      tone: "good",
      text: `Fits your style profile (${normTags(styleVibes).slice(0, 3).join(", ")}).`,
    });
  }
  if (redundantUnique.length > 0) {
    reasons.push({
      tone: "warn",
      text: `Close to ${redundantUnique.length === 1 ? `“${redundantUnique[0].name}”` : `${redundantUnique.length} pieces`} you already own — may be redundant.`,
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
  if (redundantUnique.length >= 1) s -= 2;
  if (pairsWith.some((p) => (p.item.wearCount ?? 0) >= 10)) s += 1;
  if (
    styleVibes.length &&
    normTags(item.tags).some((t) => normTags(styleVibes).includes(t))
  ) {
    s += 1;
  }
  if (costPerWear !== null && costPerWear > 15 && cpwBasis === "closet-history") {
    s -= 1; // expensive relative to how little you wear this category
  }

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
    cpwBasis,
    redundant: redundantUnique,
    reasons,
  };
}
