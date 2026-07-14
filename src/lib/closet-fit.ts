/**
 * Closet-aware shop comparison (AJA-116). The ONE module that decides how a
 * catalog product relates to the user's closet: do they already own it (or
 * something like it), and how many owned pieces does it pair with.
 *
 * The closet is the real closet — `WardrobeItem[]` from the wardrobe snapshot,
 * NOT the (unpopulated) `garments` table.
 *
 * Two things are deliberately isolated so they can be upgraded without touching
 * the endpoints:
 *   - COMPAT_ENGINE — the `Compatibility` seam (`pairs(product, item)`). The
 *     default is a shallow rule-based impl; a learned style model can replace it.
 *   - Attribute checks degrade gracefully: when fit/tone/formality is null on
 *     either side we SKIP that check and still count by category. Never throws.
 *
 * Phase 2 ships the lightweight `closetSignal`; Phase 3 adds the full
 * `scoreAgainstCloset` (ownership note + category breakdown + matched ids).
 */
import type { WardrobeItem } from "./types";
import { CATEGORY_LABEL, type Category } from "./types";

/** Minimal product attributes the comparison reads (subset of a shop_products row). */
export interface ProductAttrs {
  id: string;
  category: string;
  fit?: string | null;
  tone?: string | null; // colour group ('neutral'|'black'|'warm'|...) — falls back to attributes.color
  formality?: string | null;
  colorName?: string | null;
}

export type OwnStatus = "exact" | "similar" | "type" | "none";

/** Corner-icon signal rendered on each search result (lightweight, no breakdown). */
export interface ClosetSignal {
  owned: OwnStatus;
  pairCount: number;
}

// ---------------------------------------------------------------- compat index
export interface CompatRow {
  source_category: string;
  target_category: string;
  weight: number;
}

export interface CompatIndex {
  has(source: string, target: string): boolean;
  weight(source: string, target: string): number;
  targetsOf(source: string): string[];
}

/** Build an O(1) lookup over the outfit_compat rows (source → target → weight). */
export function buildCompatIndex(rows: CompatRow[]): CompatIndex {
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const s = r.source_category;
    if (!map.has(s)) map.set(s, new Map());
    map.get(s)!.set(r.target_category, Number(r.weight) || 0);
  }
  return {
    has: (s, t) => (map.get(s)?.get(t) ?? 0) > 0,
    weight: (s, t) => map.get(s)?.get(t) ?? 0,
    targetsOf: (s) => Array.from(map.get(s)?.keys() ?? []),
  };
}

// ---------------------------------------------------------------- attribute helpers
const FORMALITY_RANK: Record<string, number> = {
  athleisure: 0,
  streetwear: 0,
  casual: 0,
  "smart-casual": 1,
  "smart casual": 1,
  "business-casual": 1,
  "business casual": 1,
  business: 2,
  work: 2,
  formal: 2,
  statement: 3,
  evening: 3,
  party: 3,
};

const NEUTRAL_TONES = new Set([
  "neutral", "black", "white", "grey", "gray", "beige", "tan",
  "cream", "ivory", "navy", "denim", "brown", "khaki", "charcoal",
]);

function lower(s?: string | null): string | null {
  return s == null ? null : s.trim().toLowerCase() || null;
}

function eqAttr(a?: string | null, b?: string | null): boolean {
  const la = lower(a);
  const lb = lower(b);
  return la != null && lb != null && la === lb;
}

function formalityRank(f?: string | null): number | null {
  const k = lower(f);
  return k != null && k in FORMALITY_RANK ? FORMALITY_RANK[k] : null;
}

/** Formality within one level. Null on either side → skip the check (true). */
function formalityOk(a?: string | null, b?: string | null): boolean {
  const ra = formalityRank(a);
  const rb = formalityRank(b);
  if (ra == null || rb == null) return true;
  return Math.abs(ra - rb) <= 1;
}

function isNeutral(tone: string | null): boolean {
  return tone != null && NEUTRAL_TONES.has(tone);
}

/** A closet item's tone, falling back to its human colour name. */
function itemTone(item: WardrobeItem): string | null {
  return lower(item.tone) ?? lower(item.colorName);
}

/** Broad tone group for "similar" ownership: neutrals collapse together. */
function toneGroup(tone: string | null): string | null {
  if (tone == null) return null;
  return isNeutral(tone) ? "neutral" : tone;
}

/** No colour clash. Neutrals never clash. Null on either side → skip (true). */
function colorOk(product: ProductAttrs, item: WardrobeItem): boolean {
  const pt = lower(product.tone);
  const it = itemTone(item);
  if (pt == null || it == null) return true;
  if (isNeutral(pt) || isNeutral(it)) return true;
  return pt === it; // both non-neutral: only ok if the same tone group
}

// ---------------------------------------------------------------- COMPAT_ENGINE seam
/** Swappable compatibility engine. Default is `createRuleBasedCompat`. */
export interface Compatibility {
  pairs(product: ProductAttrs, item: WardrobeItem): boolean;
}

/**
 * Rule-based compatibility (deliberately shallow): category via outfit_compat,
 * formality within one level, no colour clash. Same-category pairs are excluded
 * naturally because outfit_compat never seeds source === target.
 */
export function createRuleBasedCompat(compat: CompatIndex): Compatibility {
  return {
    pairs(product, item) {
      if (!compat.has(product.category, item.category)) return false;
      if (!formalityOk(product.formality, item.formality)) return false;
      if (!colorOk(product, item)) return false;
      return true;
    },
  };
}

/** Resolve the active compatibility engine (COMPAT_ENGINE flag). */
export function getCompatEngine(compat: CompatIndex): Compatibility {
  const which = (process.env.COMPAT_ENGINE || "rule-based").toLowerCase();
  switch (which) {
    // case "learned": return createLearnedCompat(compat); // future
    case "rule-based":
    default:
      return createRuleBasedCompat(compat);
  }
}

// ---------------------------------------------------------------- ownership
/** Owned closet items (excludes wishlist) of the product's category, compared. */
export function ownershipAgainst(
  product: ProductAttrs,
  closet: WardrobeItem[],
): { status: OwnStatus; matchedGarmentId?: string } {
  const same = closet.filter((i) => i.category === product.category);
  if (same.length === 0) return { status: "none" };

  // exact: same fit AND same tone
  const exact = same.find(
    (i) => eqAttr(i.fit, product.fit) && eqAttr(itemTone(i), lower(product.tone)),
  );
  if (exact) return { status: "exact", matchedGarmentId: exact.id };

  // similar: same fit AND same tone-group
  const pGroup = toneGroup(lower(product.tone));
  const similar = same.find(
    (i) => eqAttr(i.fit, product.fit) && pGroup != null && toneGroup(itemTone(i)) === pGroup,
  );
  if (similar) return { status: "similar", matchedGarmentId: similar.id };

  // type: owns the category but it differs (or attrs unknown)
  return { status: "type", matchedGarmentId: same[0].id };
}

// ---------------------------------------------------------------- lightweight signal
/** Per-result signal for the search grid: ownership + how many owned pieces it pairs with. */
export function closetSignal(
  product: ProductAttrs,
  closet: WardrobeItem[],
  compat: CompatIndex,
): ClosetSignal {
  const own = ownershipAgainst(product, closet);
  const engine = getCompatEngine(compat);
  let pairCount = 0;
  for (const item of closet) {
    if (engine.pairs(product, item)) pairCount++;
  }
  return { owned: own.status, pairCount };
}

// ---------------------------------------------------------------- full score (product detail)
export interface Ownership {
  status: OwnStatus;
  matchedGarmentId?: string;
  note: string;
}

export interface Pairing {
  total: number;
  byCategory: Record<string, number>; // e.g. { top: 2, bottom: 1, shoes: 1 }
  matches: string[]; // ids of the closet items this product pairs with
}

export interface ClosetFit {
  ownership: Ownership;
  pairing: Pairing;
}

function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category as Category] ?? category;
}

function ownershipNote(status: OwnStatus, product: ProductAttrs): string {
  const type = categoryLabel(product.category).replace(/s$/, "").toLowerCase();
  switch (status) {
    case "exact":
      return "You already own this.";
    case "similar":
      return "Close to something you own.";
    case "type":
      return `You own a ${type} already — this one's a different fit or colour.`;
    case "none":
    default:
      return "New to your closet.";
  }
}

/**
 * Full closet fit for the product-detail screen: ownership verdict + a pairing
 * score broken down by category with the matched closet-item ids. Same rule
 * engine (COMPAT_ENGINE) as the lightweight signal, so grid and detail agree.
 */
export function scoreAgainstCloset(
  product: ProductAttrs,
  closet: WardrobeItem[],
  compat: CompatIndex,
  engine: Compatibility = getCompatEngine(compat),
): ClosetFit {
  const own = ownershipAgainst(product, closet);
  const ownership: Ownership = { ...own, note: ownershipNote(own.status, product) };

  const byCategory: Record<string, number> = {};
  const matches: string[] = [];
  for (const item of closet) {
    if (engine.pairs(product, item)) {
      matches.push(item.id);
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    }
  }
  return { ownership, pairing: { total: matches.length, byCategory, matches } };
}
