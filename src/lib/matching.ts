/**
 * Context-scored hybrid outfit engine (AJA-38).
 *
 * Pipeline: hard filters → candidate generation → multi-signal score → rank
 * with why-reasons. Randomness is only used for ties / reshuffle diversity.
 * Pure functions over the item collection (easy to unit test / move server-side).
 */

import { scoreOutfit, scorePair } from "./color";
import {
  cosineAffinity,
  embedItem,
  embedQuery,
  outfitQueryAffinity,
} from "./style-embed";
import { tasteAffinity, type TasteState } from "./taste";
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
  /** Optional taste state (like/dislike loop). */
  taste?: TasteState;
  /** Randomness source, injectable for tests. */
  random?: () => number;
  /**
   * AJA-248 — which engine to use. "v2" runs the rebuilt hard-filter + pairwise
   * scorer in ./outfit-rules. Defaults to "v1" (the shipped behaviour) because
   * this function feeds six screens; callers opt in individually.
   */
  engine?: "v1" | "v2";
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

const FORMALITY_RANK: Record<string, number> = {
  casual: 0,
  everyday: 0,
  "smart-casual": 1,
  smartcasual: 1,
  business: 1,
  work: 1,
  formal: 2,
  "black-tie": 3,
  statement: 1.5,
};

function formalityRank(f?: string | null): number | null {
  if (!f) return null;
  const k = f.toLowerCase().trim().replace(/\s+/g, "-");
  if (k in FORMALITY_RANK) return FORMALITY_RANK[k];
  if (k.includes("formal")) return 2;
  if (k.includes("smart")) return 1;
  if (k.includes("casual")) return 0;
  return null;
}

function daysSinceWorn(item: WardrobeItem, today = new Date()): number | null {
  if (!item.lastWornAt) return null;
  const t = Date.parse(item.lastWornAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor((today.getTime() - t) / 86_400_000);
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

/** Soft pool filter — prefer seasonal / weather-fit pieces, keep fallbacks. */
export function filterPool(
  items: WardrobeItem[],
  opts: GenerateOptions,
): WardrobeItem[] {
  const owned = items.filter((it) => !it.wishlist);
  const season = opts.weather?.season ?? (opts.season !== "all" ? opts.season : undefined);
  if (!season) return owned;
  const seasonal = owned.filter(
    (it) => it.seasons.length === 0 || it.seasons.includes(season),
  );
  return seasonal.length >= 4 ? seasonal : owned;
}

function itemWeight(
  item: WardrobeItem,
  picked: WardrobeItem[],
  opts: GenerateOptions,
  queryVec: number[] | null,
  recentDays: number,
): number {
  let harmony = 0.8;
  if (picked.length) {
    const worst = Math.min(
      ...picked.map((p) => scorePair(p.color, item.color).score),
    );
    harmony = worst / 100;
  }

  let vibe = 0.5;
  if (opts.vibe) vibe += item.tags.includes(opts.vibe) ? 0.35 : -0.15;
  const season = opts.weather?.season ?? opts.season;
  if (season && season !== "all") {
    vibe += item.seasons.includes(season) ? 0.15 : -0.2;
  }

  let form = 1;
  const target = formalityRank(opts.formality);
  const ir = formalityRank(item.formality);
  if (target != null && ir != null) {
    form = Math.max(0.15, 1 - Math.abs(target - ir) * 0.35);
  }

  let fresh = 1;
  const days = daysSinceWorn(item);
  if (days != null && days < recentDays) fresh = 0.15 + (days / recentDays) * 0.35;
  else if ((item.wearCount ?? 0) === 0) fresh = 1.15;
  else if ((item.wearCount ?? 0) <= 2) fresh = 1.05;

  let semantic = 1;
  if (queryVec) {
    semantic = 0.4 + cosineAffinity(embedItem(item), queryVec) * 0.6;
  }

  return Math.max(0.01, harmony ** 2 * vibe * form * fresh * semantic);
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
 * Sample one outfit draft with weighted slot fill (internal candidate gen).
 */
function sampleOutfit(
  pool: WardrobeItem[],
  opts: GenerateOptions,
  queryVec: number[] | null,
): WardrobeItem[] {
  const random = opts.random ?? Math.random;
  const recentDays = opts.excludeRecentlyWornDays ?? 3;
  const picked: WardrobeItem[] = [];

  const place = (item: WardrobeItem) => {
    if (!picked.some((p) => p.id === item.id)) picked.push(item);
  };

  if (opts.anchor) place(opts.anchor);

  const fill = (categories: WardrobeItem["category"][]) => {
    const candidates = pool.filter(
      (it) =>
        categories.includes(it.category) &&
        !picked.some((p) => p.id === it.id),
    );
    const pick = pickWeighted(
      candidates.map((it) => ({
        value: it,
        weight: itemWeight(it, picked, opts, queryVec, recentDays),
      })),
      random,
    );
    if (pick) place(pick);
  };

  const hasDress = picked.some((p) => p.category === "dress");
  const hasTopOrBottom = picked.some(
    (p) => p.category === "top" || p.category === "bottom",
  );
  const dressesAvailable = pool.some((it) => it.category === "dress");
  const useDress =
    hasDress || (!hasTopOrBottom && dressesAvailable && random() < 0.28);

  if (useDress) {
    if (!hasDress) fill(["dress"]);
  } else {
    if (!picked.some((p) => p.category === "top")) fill(["top"]);
    if (!picked.some((p) => p.category === "bottom")) fill(["bottom"]);
  }
  if (!picked.some((p) => p.category === "shoes")) fill(["shoes"]);

  const needCoat =
    opts.weather?.needsOuterwear ||
    opts.season === "winter" ||
    opts.weather?.season === "winter";
  if (!picked.some((p) => p.category === "outerwear")) {
    if (needCoat || random() < 0.45) fill(["outerwear"]);
  }
  if (!picked.some((p) => p.category === "accessory" || p.category === "bag") && random() < 0.7) {
    fill(["accessory", "bag"]);
  }

  return picked;
}

function formalityConsistency(items: WardrobeItem[], target?: string): number {
  const ranks = items
    .map((it) => formalityRank(it.formality))
    .filter((r): r is number => r != null);
  if (ranks.length < 2 && !target) return 0.7;
  const spread =
    ranks.length >= 2 ? Math.max(...ranks) - Math.min(...ranks) : 0;
  let score = spread <= 1 ? 1 : spread <= 1.5 ? 0.7 : 0.35;
  const tr = formalityRank(target);
  if (tr != null && ranks.length) {
    const avg = ranks.reduce((s, v) => s + v, 0) / ranks.length;
    score *= Math.max(0.2, 1 - Math.abs(avg - tr) * 0.35);
  }
  return score;
}

function weatherFitness(items: WardrobeItem[], weather?: WeatherContext | null, season?: Season | "all"): number {
  const szn = weather?.season ?? (season !== "all" ? season : undefined);
  if (!szn && !weather) return 0.7;
  let score = 0.75;
  if (szn) {
    const tagged = items.filter((it) => it.seasons.length > 0);
    if (tagged.length) {
      const ok = tagged.filter((it) => it.seasons.includes(szn)).length;
      score = 0.4 + (ok / tagged.length) * 0.6;
    }
  }
  const hasCoat = items.some((it) => it.category === "outerwear");
  if (weather?.needsOuterwear) {
    score *= hasCoat ? 1.1 : 0.45;
  } else if (weather && weather.tempC != null && weather.tempC >= 22 && hasCoat) {
    score *= 0.55;
  }
  return Math.max(0, Math.min(1, score));
}

function vibeMatch(items: WardrobeItem[], vibe?: string, occasion?: string): number {
  if (!vibe && !occasion) return 0.65;
  const tokens = new Set<string>();
  if (vibe) tokens.add(vibe.toLowerCase());
  if (occasion) {
    for (const w of occasion.toLowerCase().split(/\W+/)) {
      if (w.length > 2) tokens.add(w);
    }
  }
  if (!tokens.size) return 0.65;
  let hits = 0;
  for (const it of items) {
    if (it.tags.some((t) => tokens.has(t.toLowerCase()))) hits += 1;
  }
  return Math.max(0.2, Math.min(1, 0.35 + (hits / Math.max(items.length, 1)) * 0.65));
}

function antiRepeatScore(items: WardrobeItem[], recentDays: number): number {
  let score = 0.7;
  let boosts = 0;
  for (const it of items) {
    const days = daysSinceWorn(it);
    if (days != null && days < recentDays) score -= 0.18;
    else if ((it.wearCount ?? 0) === 0) {
      score += 0.08;
      boosts += 1;
    } else if ((it.wearCount ?? 0) <= 2) score += 0.04;
  }
  if (boosts >= 1) score += 0.05;
  return Math.max(0, Math.min(1, score));
}

function buildReasons(
  items: WardrobeItem[],
  signals: ScoredLook["signals"],
  opts: GenerateOptions,
): string[] {
  const reasons: string[] = [];
  if (items.length >= 2) {
    const pair = scorePair(items[0].color, items[1].color);
    const a = items[0].colorName || "this";
    const b = items[1].colorName || "that";
    if (pair.kind !== "clash") {
      reasons.push(
        pair.kind === "neutral"
          ? `${a} and ${b} stay easy together`
          : `${pair.label.toLowerCase()} colours (${a} + ${b})`,
      );
    }
  }
  if (signals.formality >= 0.75 && opts.formality) {
    reasons.push(`Keeps a ${opts.formality} dress code`);
  } else if (signals.formality >= 0.75) {
    const forms = items.map((i) => i.formality).filter(Boolean);
    if (forms[0]) reasons.push(`Consistent ${forms[0]} pieces`);
  }
  if (opts.weather?.needsOuterwear && items.some((i) => i.category === "outerwear")) {
    reasons.push("Layered for today's weather");
  } else if (opts.weather?.season) {
    reasons.push(`Suited to ${opts.weather.season}`);
  }
  if (opts.vibe || opts.occasion) {
    const label = opts.occasion || opts.vibe!;
    reasons.push(`Tuned for ${label}`);
  }
  const forgotten = items.find((it) => (it.wearCount ?? 0) === 0 || (daysSinceWorn(it) ?? 999) > 21);
  if (forgotten && signals.antiRepeat >= 0.7) {
    reasons.push(
      (forgotten.wearCount ?? 0) === 0
        ? `Brings back your ${forgotten.name}`
        : `Haven't worn ${forgotten.name} in a while`,
    );
  }
  if (signals.semantic >= 0.72 && (opts.mood || opts.occasion)) {
    reasons.push(`Matches “${opts.mood || opts.occasion}”`);
  }
  return reasons.slice(0, 3);
}

/** Multi-signal score for a complete look → ScoredLook. */
export function scoreLook(
  items: WardrobeItem[],
  opts: GenerateOptions = {},
  queryVec: number[] | null = null,
): ScoredLook {
  const recentDays = opts.excludeRecentlyWornDays ?? 3;
  const color = items.length >= 2 ? scoreOutfit(items.map((i) => i.color)) / 100 : 0.7;
  const formality = formalityConsistency(items, opts.formality);
  const weather = weatherFitness(items, opts.weather, opts.season);
  const vibe = vibeMatch(items, opts.vibe, opts.occasion);
  const antiRepeat = antiRepeatScore(items, recentDays);
  const semantic = queryVec
    ? outfitQueryAffinity(items, queryVec)
    : 0.55;
  const taste = opts.taste ? tasteAffinity(items, opts.taste) : 0.5;

  // Weights from plan (semantic slot used when query present; else redistributed lightly).
  const hasSemantic = Boolean(queryVec && (opts.mood || opts.occasion || opts.vibe));
  const w = hasSemantic
    ? { semantic: 0.25, color: 0.2, formality: 0.2, weather: 0.15, vibe: 0.1, antiRepeat: 0.1 }
    : { semantic: 0.05, color: 0.28, formality: 0.22, weather: 0.18, vibe: 0.14, antiRepeat: 0.13 };

  let composite =
    w.semantic * semantic +
    w.color * color +
    w.formality * formality +
    w.weather * weather +
    w.vibe * vibe +
    w.antiRepeat * antiRepeat;

  // Soft taste nudge (not in the published weights table — small).
  composite = composite * 0.92 + taste * 0.08;

  // Completeness bonus
  const hasShoes = items.some((i) => i.category === "shoes");
  const hasCore =
    items.some((i) => i.category === "dress") ||
    (items.some((i) => i.category === "top") && items.some((i) => i.category === "bottom"));
  if (hasShoes) composite += 0.03;
  if (!hasCore) composite *= 0.5;

  const signals = { color, formality, weather, vibe, antiRepeat, semantic, taste };
  const draft = draftFromPicked(items);
  const score = Math.round(Math.max(0, Math.min(1, composite)) * 100);
  return {
    draft,
    itemIds: draftIds(draft),
    items,
    score,
    signals,
    reasons: buildReasons(items, signals, opts),
  };
}

/**
 * Ranked outfit suggestions — primary API for Explore / Today / Stylist / Calendar.
 */
export function suggestLooks(
  items: WardrobeItem[],
  opts: GenerateOptions = {},
): ScoredLook[] {
  if (opts.engine === "v2") return suggestLooksV2(items, opts);
  const pool = filterPool(items, opts);
  if (pool.length < 2 && !opts.anchor) return [];

  const queryText = [opts.mood, opts.occasion, opts.vibe].filter(Boolean).join(" ");
  const queryVec = queryText
    ? embedQuery(queryText, {
        vibe: opts.vibe,
        season: opts.weather?.season ?? opts.season,
        formality: opts.formality,
      })
    : null;

  const n = opts.candidates ?? 24;
  const want = opts.count ?? 3;
  const seen = new Set<string>();
  const looks: ScoredLook[] = [];

  for (let i = 0; i < n; i++) {
    const picked = sampleOutfit(pool, opts, queryVec);
    if (picked.length < 2) continue;
    const key = picked
      .map((p) => p.id)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    looks.push(scoreLook(picked, opts, queryVec));
  }

  looks.sort((a, b) => b.score - a.score);
  // Light diversity: if top two share ≥80% of pieces, prefer next distinct.
  const out: ScoredLook[] = [];
  for (const look of looks) {
    if (out.length >= want) break;
    const overlapHeavy = out.some((prev) => {
      const set = new Set(prev.itemIds);
      const shared = look.itemIds.filter((id) => set.has(id)).length;
      return shared / Math.max(look.itemIds.length, 1) >= 0.8;
    });
    if (overlapHeavy && out.length > 0 && looks.length > out.length + 1) continue;
    out.push(look);
  }
  // Fill if diversity filter was too aggressive.
  for (const look of looks) {
    if (out.length >= want) break;
    if (!out.some((o) => o.itemIds.join() === look.itemIds.join())) out.push(look);
  }
  return out;
}

/**
 * Generate a single outfit draft (backward-compatible). Uses the hybrid ranker
 * under the hood; falls back to one sample if ranking yields nothing.
 */
export function generateOutfit(
  items: WardrobeItem[],
  opts: GenerateOptions = {},
): Record<SlotKey, string[]> {
  const ranked = suggestLooks(items, { ...opts, count: 1, candidates: opts.candidates ?? 12 });
  if (ranked[0]) return ranked[0].draft;
  const pool = filterPool(items, opts);
  const queryText = [opts.mood, opts.occasion, opts.vibe].filter(Boolean).join(" ");
  const queryVec = queryText
    ? embedQuery(queryText, { vibe: opts.vibe, season: opts.season, formality: opts.formality })
    : null;
  return draftFromPicked(sampleOutfit(pool, opts, queryVec));
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
 * AJA-248 engine v2 — hard filters, then a pairwise score, then a slate
 * diversified on garment TYPE rather than item id. Returns the same ScoredLook
 * shape as v1 so every caller is unaffected.
 *
 * Reached only via `opts.engine === "v2"`.
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

  const tries = opts.candidates ?? 400;
  const seen = new Set<string>();
  const scored: { look: ScoredLook; items: WardrobeItem[] }[] = [];

  for (let n = 0; n < tries; n++) {
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
    // Accessories opt-in and rarer than v1's 70%, which put a knit scarf in 39%
    // of looks from a five-item accessory pool.
    if (random() < 0.3 && !picked.some((p) => p.category === "accessory" || p.category === "bag")) {
      place(random() < 0.5 ? pick("accessory") : pick("bag"));
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
