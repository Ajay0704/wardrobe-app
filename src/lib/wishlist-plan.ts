/**
 * Shopping-plan maths for the wishlist (AJA-242).
 *
 * Pure and separately testable on purpose. The over-budget line is the part that has
 * to be *derived*: an earlier hand-written version claimed "you're $-5 under", which
 * was both the wrong sign and a false claim. The promise it makes ("drop the
 * duplicates and you're $45 under") must equal what actually happens when you drop
 * them, so it is computed from the same numbers and unit-tested against that identity.
 */
import { formatMoney } from "./currency";
import { analyzeSmartBuy } from "./smart-buy";
import type { WardrobeItem } from "./types";

/** Pair count at or above which a piece counts as "goes with a lot". */
export const GOES_A_LOT = 5;

export interface WishVerdict {
  tone: "good" | "warn";
  text: string;
  /** Owned pieces this would duplicate — the only honest reason to say no. */
  redundantCount: number;
  /** Owned pieces it pairs well with. */
  pairCount: number;
}

/**
 * One line per wishlist item, from the engine that already exists. `analyzeSmartBuy`
 * computes both halves; this only chooses which one to say.
 */
export function wishVerdict(
  item: WardrobeItem,
  allItems: WardrobeItem[],
  styleVibes?: string[],
): WishVerdict {
  let redundantCount = 0;
  let pairCount = 0;
  try {
    const r = analyzeSmartBuy(item, allItems, { styleVibes });
    redundantCount = r.redundant.length;
    pairCount = r.pairsWith.length;
  } catch {
    // A malformed item shouldn't blank the whole grid.
  }
  if (redundantCount > 0) {
    return {
      tone: "warn",
      text:
        redundantCount === 1
          ? "You already own one of these"
          : `You already own ${redundantCount} like this`,
      redundantCount,
      pairCount,
    };
  }
  return {
    tone: "good",
    text:
      pairCount === 0
        ? "Nothing in your closet pairs with it yet"
        : `Goes with ${pairCount} thing${pairCount === 1 ? "" : "s"} you own`,
    redundantCount,
    pairCount,
  };
}

export interface PlanTotals {
  committed: number;
  budget: number;
  over: boolean;
  /** Signed: positive when there's headroom, negative when over. */
  remaining: number;
  /** 0..100, clamped, for the bar. */
  pct: number;
}

export function planTotals(wishlist: WardrobeItem[], budget: number): PlanTotals {
  const committed = wishlist.reduce((sum, it) => sum + (it.price ?? 0), 0);
  const safeBudget = budget > 0 ? budget : 0;
  return {
    committed,
    budget: safeBudget,
    over: safeBudget > 0 && committed > safeBudget,
    remaining: safeBudget - committed,
    pct: safeBudget > 0 ? Math.min(100, (committed / safeBudget) * 100) : 0,
  };
}

export interface PlanNoteInput {
  committed: number;
  budget: number;
  /** Total price of the items whose verdict says you already own something similar. */
  dupeTotal: number;
  dupeCount: number;
  itemCount: number;
  currency: string;
}

/**
 * The line under the budget bar. Every number in it is computed; nothing is phrased.
 *
 * When it says "drop the duplicates and you're X under", X is exactly
 * `budget - (committed - dupeTotal)` — so acting on the advice lands on the number.
 */
export function planNote(i: PlanNoteInput): string {
  const m = (n: number) => formatMoney(n, i.currency, 0);
  const pieces = `${i.itemCount} ${i.itemCount === 1 ? "piece" : "pieces"}`;

  if (i.budget <= 0) return `${pieces} on the list, ${m(i.committed)} in total.`;

  if (i.committed <= i.budget) {
    return `${m(i.budget - i.committed)} left. ${pieces} on the list.`;
  }

  const head = `${m(i.committed - i.budget)} over.`;
  if (i.dupeCount === 0) {
    return `${head} Nothing here duplicates what you own — it's just more than you planned.`;
  }
  const label = i.dupeCount === 1 ? "the duplicate" : `the ${i.dupeCount} duplicates`;
  const after = i.committed - i.dupeTotal;
  return after <= i.budget
    ? `${head} Drop ${label} of things you already own and you're ${m(i.budget - after)} under.`
    : `${head} Even without ${label} you'd still be ${m(after - i.budget)} over.`;
}

export type WishFilter = "all" | "goes" | "dupe" | "fits";

export interface WishChip {
  key: WishFilter;
  label: string;
  count: number;
}

function passes(
  key: WishFilter,
  it: WardrobeItem,
  v: WishVerdict | undefined,
  headroom: number,
): boolean {
  if (key === "all") return true;
  if (key === "goes") return (v?.pairCount ?? 0) >= GOES_A_LOT && !v?.redundantCount;
  if (key === "dupe") return (v?.redundantCount ?? 0) > 0;
  // "fits what's left" — derived from the actual remaining budget rather than an
  // arbitrary price cut-off.
  return typeof it.price === "number" && it.price > 0 && it.price <= headroom;
}

export function filterWishlist(
  key: WishFilter,
  wishlist: WardrobeItem[],
  verdicts: Map<string, WishVerdict>,
  headroom: number,
): WardrobeItem[] {
  return wishlist.filter((it) => passes(key, it, verdicts.get(it.id), headroom));
}

/** Only chips that would actually show something, so the row never lies. */
export function presentWishChips(
  wishlist: WardrobeItem[],
  verdicts: Map<string, WishVerdict>,
  headroom: number,
): WishChip[] {
  const defs: { key: WishFilter; label: string }[] = [
    { key: "all", label: "Everything" },
    { key: "goes", label: "Goes with a lot" },
    { key: "dupe", label: "Already own similar" },
    { key: "fits", label: "Fits what's left" },
  ];
  const chips: WishChip[] = [];
  for (const d of defs) {
    if (d.key === "fits" && headroom <= 0) continue;
    const count = filterWishlist(d.key, wishlist, verdicts, headroom).length;
    if (d.key === "all" || count > 0) chips.push({ ...d, count });
  }
  return chips.length > 1 ? chips : [];
}
