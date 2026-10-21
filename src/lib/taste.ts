/**
 * Personal taste loop (AJA-38 Phase 3): like/dislike on suggested outfits
 * nudges a small taste vector in localStorage so future rankings prefer
 * similar pieces and avoid disliked combos.
 */

import { EMBED_DIM, embedItem } from "./style-embed";
import { CATEGORIES, type WardrobeItem } from "./types";

const KEY = "wardrobe-taste-v1";

export interface TasteState {
  /** Running mean of liked item embeddings. */
  liked: number[];
  /** Running mean of disliked item embeddings. */
  disliked: number[];
  likedCount: number;
  dislikedCount: number;
  /** Pair keys "idA|idB" (sorted) the user marked as mismatched. */
  badPairs: string[];
}

function empty(): TasteState {
  return {
    liked: new Array(EMBED_DIM).fill(0),
    disliked: new Array(EMBED_DIM).fill(0),
    likedCount: 0,
    dislikedCount: 0,
    badPairs: [],
  };
}

function blend(mean: number[], count: number, sample: number[]): number[] {
  if (count <= 0) return sample.slice();
  const n = count + 1;
  return mean.map((v, i) => (v * count + sample[i]) / n);
}

export function readTaste(): TasteState {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as TasteState;
    if (!Array.isArray(parsed.liked) || parsed.liked.length !== EMBED_DIM) return empty();
    return {
      ...empty(),
      ...parsed,
      liked: parsed.liked,
      disliked: Array.isArray(parsed.disliked) && parsed.disliked.length === EMBED_DIM
        ? parsed.disliked
        : empty().disliked,
      badPairs: Array.isArray(parsed.badPairs) ? parsed.badPairs.slice(-80) : [],
    };
  } catch {
    return empty();
  }
}

function writeTaste(t: TasteState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* quota */
  }
}

function meanEmbed(items: WardrobeItem[]): number[] {
  const acc = new Array(EMBED_DIM).fill(0);
  if (!items.length) return acc;
  for (const it of items) {
    const e = embedItem(it);
    for (let i = 0; i < EMBED_DIM; i++) acc[i] += e[i];
  }
  return acc.map((v) => v / items.length);
}

export function recordOutfitFeedback(
  items: WardrobeItem[],
  verdict: "like" | "dislike",
  mismatchedPair?: [string, string],
): TasteState {
  const t = readTaste();
  const sample = meanEmbed(items);
  if (verdict === "like") {
    t.liked = blend(t.liked, t.likedCount, sample);
    t.likedCount += 1;
  } else {
    t.disliked = blend(t.disliked, t.dislikedCount, sample);
    t.dislikedCount += 1;
    if (mismatchedPair) t.badPairs = withBadPair(t.badPairs, mismatchedPair);
  }
  writeTaste(t);
  return t;
}

/** Sorted "idA|idB", the form `badPairs` stores and the engine reads. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function withBadPair(pairs: string[], [a, b]: [string, string]): string[] {
  const key = pairKey(a, b);
  return pairs.includes(key) ? pairs : [...pairs, key].slice(-80);
}

/**
 * "These two don't go" on its own, without disliking the whole look (AJA-299). A
 * swap that fixes one pairing is engagement with the look, not a rejection of it.
 */
export function recordBadPair(a: string, b: string): TasteState {
  const t = readTaste();
  t.badPairs = withBadPair(t.badPairs, [a, b]);
  writeTaste(t);
  return t;
}

/**
 * Un-learn one pair (AJA-300): "actually, these two DO go". `badPairs` is a hard
 * filter, so a wrong guess from a flag or a swap bans a pairing until this runs. Only
 * the pair goes — any dislike recorded with it was about the whole look, and it can't
 * be pulled back out of the running mean anyway.
 */
export function removeBadPair(a: string, b: string): TasteState {
  const t = readTaste();
  const key = pairKey(a, b);
  if (!t.badPairs.includes(key)) return t;
  t.badPairs = t.badPairs.filter((p) => p !== key);
  writeTaste(t);
  return t;
}

/** Forget everything learned on this device (AJA-300): back to the engine's own ranking. */
export function resetTaste(): TasteState {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  }
  return empty();
}

/** Garment order within a pair, so it reads "tee with jeans", not by id. */
const PAIR_ORDER: Record<string, number> = Object.fromEntries(
  CATEGORIES.map((c, i) => [c.value, i]),
);

/**
 * Learned bad pairs resolved to the pieces they name, newest first — the Settings
 * readout (AJA-300). A pair whose piece has since been deleted is skipped: the engine
 * can never draw it again, so there's nothing to show or undo.
 */
export function learnedBadPairs(
  taste: TasteState,
  items: WardrobeItem[],
): [WardrobeItem, WardrobeItem][] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: [WardrobeItem, WardrobeItem][] = [];
  for (let k = taste.badPairs.length - 1; k >= 0; k--) {
    const [a, b] = taste.badPairs[k].split("|").map((id) => byId.get(id));
    if (!a || !b) continue;
    out.push((PAIR_ORDER[a.category] ?? 99) <= (PAIR_ORDER[b.category] ?? 99) ? [a, b] : [b, a]);
  }
  return out;
}

/** Cosine-ish affinity of an outfit to the taste vector, 0–1. Neutral when empty. */
export function tasteAffinity(items: WardrobeItem[], taste: TasteState = readTaste()): number {
  if (!items.length) return 0.5;
  const sample = meanEmbed(items);
  const likeDot = taste.likedCount > 0 ? dot(sample, taste.liked) : 0;
  const dislikeDot = taste.dislikedCount > 0 ? dot(sample, taste.disliked) : 0;
  // Start at 0.5; pull toward likes, away from dislikes.
  let score = 0.5 + likeDot * 0.25 - dislikeDot * 0.3;
  // Penalize known bad pairs present in this look.
  if (taste.badPairs.length) {
    const ids = items.map((i) => i.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join("|");
        if (taste.badPairs.includes(key)) score -= 0.2;
      }
    }
  }
  return Math.max(0, Math.min(1, score));
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
