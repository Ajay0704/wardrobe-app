/**
 * AJA-286 — the ageing-wishlist nudge, chosen purely so it's unit-testable apart from
 * the cron's IO. Given one user's wardrobe, pick the single saved-but-undecided piece
 * most worth a gentle reminder, and phrase it the way the issue insists: **lead with the
 * closet, never the urgency** — "you saved this, and you already own two that do this job."
 *
 * v1 only nudges the on-message case (`redundantCount >= 1`): if we can't truthfully say
 * "you already own N like it", we say nothing rather than fall back to a "still in stock!"
 * urgency line the positioning is built to avoid. The similarity is the whole point, and a
 * false "you own two like it" would burn trust faster than the feature builds it — so we
 * reuse the exact engine (`wishVerdict` → `analyzeSmartBuy`) the wishlist grid already shows.
 */
import type { WardrobeItem } from "./types";
import { wishVerdict } from "./wishlist-plan";

const DAY_MS = 86_400_000;

export interface AgingConfig {
  /** Don't nudge before a piece has aged this long (the reflection window). */
  minDays: number;
  /** Stop nudging once it's this stale — an ancient save reads as clutter, not a decision. */
  maxDays: number;
}

/** ~30 days is the reflection window (see the research doc); tune, don't hardcode at call sites. */
export const AGING_DEFAULTS: AgingConfig = { minDays: 30, maxDays: 90 };

export interface AgingCandidate {
  item: WardrobeItem;
  ageDays: number;
  /** How many owned pieces already do this job — the honest reason to pause. */
  redundantCount: number;
  title: string;
  body: string;
}

/** "3 weeks ago" up to six weeks, then "2 months ago" — round numbers, no false precision. */
function agePhrase(ageDays: number): string {
  const weeks = Math.max(1, Math.round(ageDays / 7));
  if (weeks <= 6) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.max(1, Math.round(ageDays / 30));
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function copyFor(item: WardrobeItem, ageDays: number, redundantCount: number): {
  title: string;
  body: string;
} {
  const name = item.name?.trim() || "that piece";
  const does = redundantCount === 1 ? "does" : "do";
  return {
    title: "Still want it?",
    // Closet first, no countdown, no "selling fast" — just the fact that makes it a real decision.
    body: `You saved ${name} ${agePhrase(ageDays)} — and you already own ${redundantCount} that ${does} the same job.`,
  };
}

/**
 * Pick the single best ageing-wishlist nudge for one user's wardrobe, or `null` if none
 * qualifies. One per user per run — a digest of the *most* overdue decision — keeps the
 * feature naturally low-frequency (the fatigue guardrail is "don't send much", not "cap later").
 *
 * @param items       the user's whole wardrobe (owned + wishlist), from the snapshot blob
 * @param decidedRefs item ids already resolved in the Decision bank — never re-ask
 * @param now         epoch ms (injected so this stays pure/testable)
 */
export function pickAgingNudge(
  items: WardrobeItem[],
  decidedRefs: Set<string>,
  now: number,
  cfg: AgingConfig = AGING_DEFAULTS,
): AgingCandidate | null {
  if (!Array.isArray(items)) return null;

  let best: AgingCandidate | null = null;
  for (const it of items) {
    if (!it?.wishlist || !it.id || typeof it.createdAt !== "number") continue;
    if (decidedRefs.has(it.id)) continue; // already bought/skipped/waited — the loop closed
    const ageDays = Math.floor((now - it.createdAt) / DAY_MS);
    if (ageDays < cfg.minDays || ageDays > cfg.maxDays) continue;

    const { redundantCount } = wishVerdict(it, items);
    if (redundantCount < 1) continue; // v1: only the truthful "you already own N like it" case

    // Most overdue a decision wins (oldest first); ties don't matter.
    if (!best || ageDays > best.ageDays) {
      best = { item: it, ageDays, redundantCount, ...copyFor(it, ageDays, redundantCount) };
    }
  }
  return best;
}
