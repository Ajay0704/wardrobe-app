/**
 * Shop ranking + interleaving for the closet-aware-recs experiment (AJA-174).
 * We compare two rankers of the same result set:
 *   - "generic": the search relevance order as-is (control).
 *   - "closet":  re-ranked by closetSignal (ownership, pairCount, size match).
 * `interleaveShop` blends them with deterministic, position-balanced team-draft
 * interleaving so neither ranker is favored by slot — the standard low-traffic way
 * to measure which ranker wins the click.
 */
import { yourSize } from "./fit";
import type { UserProfile } from "./profile";
import type { ShopResult } from "./shop-search";

export const SHOP_EXPERIMENT = process.env.NEXT_PUBLIC_SHOP_INTERLEAVE !== "0";

export type Ranker = "closet" | "generic";
export interface RankedResult {
  result: ShopResult;
  ranker: Ranker;
  position: number;
}

const OWN_SCORE: Record<string, number> = { similar: 1, exact: 0.6, type: 0.4, none: 0 };

/** Higher = better closet fit. Used only to build the "closet" ordering. */
export function closetScore(r: ShopResult, profile: UserProfile): number {
  const s = r.closetSignal;
  let score = (OWN_SCORE[s.owned] ?? 0) * 2;
  score += Math.min(s.pairCount, 8) * 0.25;
  if (yourSize(profile, r.category)) score += 0.5;
  return score;
}

/** Compact closet-signal label for telemetry, e.g. "similar:6". */
export function closetMatchLabel(r: ShopResult): string {
  return `${r.closetSignal.owned}:${r.closetSignal.pairCount}`;
}

/** Trivial pass-through tagging (control / experiment off). */
export function genericRanked(items: ShopResult[]): RankedResult[] {
  return items.map((result, position) => ({ result, ranker: "generic", position }));
}

export function interleaveShop(items: ShopResult[], profile: UserProfile): RankedResult[] {
  const generic = items; // search relevance order
  const closet = [...items].sort((a, b) => closetScore(b, profile) - closetScore(a, profile));
  const picked = new Set<string>();
  const out: RankedResult[] = [];
  const g = { i: 0 };
  const c = { i: 0 };

  const take = (arr: ShopResult[], ref: { i: number }, ranker: Ranker) => {
    while (ref.i < arr.length && picked.has(arr[ref.i].productId)) ref.i++;
    if (ref.i >= arr.length) return;
    const r = arr[ref.i++];
    picked.add(r.productId);
    out.push({ result: r, ranker, position: out.length });
  };

  let round = 0;
  while (picked.size < items.length && round <= items.length + 2) {
    // Alternate who picks first each round → balanced positions, deterministic.
    if (round % 2 === 1) {
      take(closet, c, "closet");
      take(generic, g, "generic");
    } else {
      take(generic, g, "generic");
      take(closet, c, "closet");
    }
    round++;
  }
  return out;
}
