/**
 * Outfit engine (AJA-38, rebuilt in AJA-248, sole engine since AJA-259).
 *
 * Pipeline: reject outright anything incoherent (`rejectOutfit`), score what
 * survives on pairwise compatibility (`scoreOutfitV2`), then return a slate of
 * three diversified by garment type via maximal marginal relevance. Pure
 * functions over the item collection, so it unit-tests and could move
 * server-side unchanged.
 */

import { scoreOutfit } from "./color";
import { type TasteState } from "./taste";
import {
  explainOutfit,
  lookSimilarity,
  rejectOutfit,
  scoreOutfitV2,
  type OutfitContext,
} from "./outfit-rules";
import type { Season, SlotKey, WardrobeItem } from "./types";

export interface WeatherContext {
  season: Season;
  needsOuterwear: boolean;
  tempC?: number;
}

export interface GenerateOptions {
  /** Anchor the outfit around this item (always included). */
  anchor?: WardrobeItem;
  /** Prefer items carrying this tag/vibe ("casual", "work", ...). */
  vibe?: string;
  /** Prefer items suitable for this season. */
  season?: Season | "all";
  /** Free-text occasion ("work meeting", "date night"). */
  occasion?: string;
  /** Free-text mood ("cozy brunch", "sharp and minimal"). */
  mood?: string;
  /** Target dress code. */
  formality?: string;
  /** Live weather — drives season + outerwear hard/soft rules. */
  weather?: WeatherContext | null;
  /** Down-rank items worn within this many days (default 3). */
  excludeRecentlyWornDays?: number;
  /** How many candidate looks to sample before ranking (default 24). */
  candidates?: number;
  /** How many top looks to return from suggestLooks (default 1). */
  count?: number;
  /**
   * Optional taste state (the like/dislike loop, AJA-38).
   *
   * WARNING: currently IGNORED. The v2 scorer never reads it, so the like/dislike
   * feedback recorded by `recordOutfitFeedback` in the stylist affects nothing.
   * That was already true whenever the v2 toggle was on; removing the old engine
   * (AJA-259) makes it permanent. Kept in the signature deliberately rather than
   * deleted, so the disconnect stays visible instead of silently disappearing.
   * Tracked in AJA-260.
   */
  taste?: TasteState;
  /** Randomness source, injectable for tests. */
  random?: () => number;
}

export interface ScoredLook {
  draft: Record<SlotKey, string[]>;
  itemIds: string[];
  items: WardrobeItem[];
  /** Composite 0–100 score (same scale as legacy outfitScore for UI badges). */
  score: number;
  /** Breakdown 0–1 for debugging / future UI. Extra keys when engine "v2". */
  signals: {
    [k: string]: number | undefined;
    color: number;
    formality: number;
    weather: number;
    vibe: number;
    antiRepeat: number;
    semantic: number;
    taste: number;
  };
  /** Short human "why this works" lines. */
  reasons: string[];
}

function emptyDraft(): Record<SlotKey, string[]> {
  return {
    top: [],
    bottom: [],
    dress: [],
    outerwear: [],
    shoes: [],
    accessories: [],
  };
}

function draftFromPicked(picked: WardrobeItem[]): Record<SlotKey, string[]> {
  const draft = emptyDraft();
  for (const item of picked) {
    if (item.category === "top") draft.top = [item.id];
    else if (item.category === "bottom") draft.bottom = [item.id];
    else if (item.category === "dress") draft.dress = [item.id];
    else if (item.category === "outerwear") draft.outerwear = [item.id];
    else if (item.category === "shoes") draft.shoes = [item.id];
    else if (draft.accessories.length < 3) draft.accessories.push(item.id);
  }
  return draft;
}

function draftIds(draft: Record<SlotKey, string[]>): string[] {
  return [
    ...draft.outerwear,
    ...draft.dress,
    ...draft.top,
    ...draft.bottom,
    ...draft.shoes,
    ...draft.accessories,
  ];
}

/**
 * Ranked outfit suggestions — primary API for Explore / Today / Stylist / Calendar.
 *
 * AJA-259: this used to dispatch between two engines on `opts.engine`. There is
 * only one now — the hard-filter + pairwise scorer in ./outfit-rules, which shipped
 * behind a toggle, was confirmed on device, and has replaced the original sampler
 * outright. The old one measured statistically indistinguishable from picking at
 * random (median score 84 for both it and a uniform-random control), so keeping it
 * as a fallback would have meant keeping a fallback that did not work.
 */
export function suggestLooks(
  items: WardrobeItem[],
  opts: GenerateOptions = {},
): ScoredLook[] {
  return suggestLooksV2(items, opts);
}

/** Best single look with reasons — preferred over raw generateOutfit for UI. */
export function bestLook(
  items: WardrobeItem[],
  opts: GenerateOptions = {},
): ScoredLook | null {
  return suggestLooks(items, { ...opts, count: 1, candidates: opts.candidates ?? 18 })[0] ?? null;
}

/** Convenience: overall color-harmony score for a set of items (legacy badge). */
export function outfitScore(items: WardrobeItem[]): number {
  return scoreOutfit(items.map((it) => it.color));
}

/** One-line reason for UI (joins top reasons). */
export function lookReasonLine(look: ScoredLook): string {
  return look.reasons[0] ?? "A solid pairing from your closet.";
}

/**
 * The engine (AJA-248): hard filters, then a pairwise score over every garment
 * pair, then a slate diversified on garment TYPE rather than item id — two
 * different jerseys are the same outfit.
 */
function suggestLooksV2(
  items: WardrobeItem[],
  opts: GenerateOptions,
): ScoredLook[] {
  const random = opts.random ?? Math.random;
  const pool = items.filter((it) => !it.wishlist && it.imageUrl);
  if (pool.length < 2 && !opts.anchor) return [];

  const ctx: OutfitContext = {
    season: opts.weather?.season ?? opts.season,
    tempC: opts.weather?.tempC ?? null,
    needsOuterwear: opts.weather?.needsOuterwear,
    occasion: opts.occasion,
    vibe: opts.vibe,
    formality: opts.formality,
  };
  const wantsCoat =
    ctx.needsOuterwear === true || ctx.season === "winter" || ctx.season === "fall";

  const byCat = new Map<string, WardrobeItem[]>();
  for (const it of pool) {
    const list = byCat.get(it.category) ?? [];
    list.push(it);
    byCat.set(it.category, list);
  }
  const pick = (cat: string): WardrobeItem | null => {
    const list = byCat.get(cat);
    if (!list?.length) return null;
    return list[Math.floor(random() * list.length)];
  };

  /**
   * `candidates` means "accepted candidates to aim for", NOT raw sampling
   * attempts. v1 had no hard filters, so N attempts yielded ~N usable looks and
   * callers pass small numbers (styleWays passes count*10 = 30). v2 rejects most
   * attempts, so treating it as attempts starved every such caller: Rediscover
   * returned 0.25 ideas per run instead of 3. Sample until the pool is full or
   * the cap is hit — this is pure in-memory work, so the cap is cheap.
   */
  const wantPool = Math.max(opts.candidates ?? 60, 24);
  const maxTries = Math.max(wantPool * 25, 800);
  const seen = new Set<string>();
  const scored: { look: ScoredLook; items: WardrobeItem[] }[] = [];

  for (let n = 0; n < maxTries && scored.length < wantPool; n++) {
    const picked: WardrobeItem[] = [];
    const place = (it: WardrobeItem | null) => {
      if (it && !picked.some((p) => p.id === it.id)) picked.push(it);
    };
    if (opts.anchor) place(opts.anchor);
    const hasCore = picked.some((p) => p.category === "dress") ||
      (picked.some((p) => p.category === "top") && picked.some((p) => p.category === "bottom"));
    if (!hasCore) {
      if ((byCat.get("dress")?.length ?? 0) > 0 && random() < 0.2) place(pick("dress"));
      else { place(pick("top")); place(pick("bottom")); }
    }
    if (!picked.some((p) => p.category === "shoes")) place(pick("shoes"));
    // Outerwear only when the weather earns it (v1 fires on random() < 0.45).
    if (wantsCoat && !picked.some((p) => p.category === "outerwear") && random() < 0.6) {
      place(pick("outerwear"));
    }
    // AJA-256. This was `random() < 0.3` then a blind 50/50 between accessory and
    // bag, which dropped accessories from v1's 80.3% of looks to 4.9% — sunglasses
    // stopped appearing at all. Three things were wrong:
    //
    //  1. The 0.3 gate. I cut it from v1's 0.7 because v1 put a knit scarf in 39%
    //     of summer looks — but rejectOutfit's knit-in-warm-weather filter already
    //     fixes that. The rate cut fixed the same bug a second time and took every
    //     other accessory down with it.
    //  2. The 50/50 coin. The measured closet has ZERO bags, so half the attempts
    //     drew from an empty pool and placed nothing, halving 0.3 to an effective
    //     0.15. Choose proportionally to what actually exists instead.
    //  3. Even then rejectOutfit legitimately removes most of a small accessory
    //     drawer per season, so the attempt rate has to sit well above the target
    //     appearance rate.
    //
    // TUNE: the gate is near-linear in the resulting rate (measured 0.55 -> 21.7%
    // of summer looks, 0.70 -> 29.1%, 0.85 -> 40.1%). 0.70 is "sometimes, not every
    // time" — the user's words: at 29% per look, a three-look slate shows an
    // accessory ~64% of the time. Guarded by a rate BAND in the test, not a point.
    if (random() < 0.7 && !picked.some((p) => p.category === "accessory" || p.category === "bag")) {
      const nAcc = byCat.get("accessory")?.length ?? 0;
      const nBag = byCat.get("bag")?.length ?? 0;
      if (nAcc + nBag > 0) {
        place(random() < nAcc / (nAcc + nBag) ? pick("accessory") : pick("bag"));
      }
    }
    if (picked.length < 2) continue;
    const key = picked.map((p) => p.id).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    if (rejectOutfit(picked, ctx)) continue;

    const { score, signals } = scoreOutfitV2(picked, ctx);
    const draft = draftFromPicked(picked);
    scored.push({
      items: picked,
      look: {
        draft,
        itemIds: draftIds(draft),
        items: picked,
        score,
        // v1 signal keys kept present so existing consumers don't break; the v2
        // breakdown rides alongside via the index signature.
        signals: {
          // v2 breakdown rides along via the index signature; the v1 keys are
          // aliased on top so existing consumers keep working. `formality` is
          // shared and comes from the spread.
          ...signals,
          color: signals.colour,
          weather: signals.context,
          vibe: signals.style,
          antiRepeat: signals.utility,
          semantic: signals.role,
          taste: signals.balance,
        },
        reasons: explainOutfit(picked, signals, ctx),
      },
    });
  }
  if (!scored.length) return [];
  scored.sort((a, b) => b.look.score - a.look.score);

  // Slate by MMR at descending lambda: safe / elevated / experimental. Canvas
  // brief p3 — "a random shuffle is not a surprise feature".
  const want = opts.count ?? 1;
  const lambdas = [0.85, 0.55, 0.35];
  const best = scored[0].look.score || 1;
  const out: ScoredLook[] = [];
  const takenItems: WardrobeItem[][] = [];
  for (let slot = 0; slot < want; slot++) {
    const lambda = lambdas[Math.min(slot, lambdas.length - 1)];
    let bestVal = -Infinity;
    let bestIdx = -1;
    for (let i = 0; i < scored.length; i++) {
      if (out.includes(scored[i].look)) continue;
      const rel = scored[i].look.score / best;
      const sim = takenItems.length
        ? Math.max(...takenItems.map((t) => lookSimilarity(scored[i].items, t)))
        : 0;
      const val = lambda * rel - (1 - lambda) * sim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    if (bestIdx < 0) break;
    out.push(scored[bestIdx].look);
    takenItems.push(scored[bestIdx].items);
  }
  return out;
}
