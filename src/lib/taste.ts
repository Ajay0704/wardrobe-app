/**
 * Personal taste loop (AJA-38 Phase 3): like/dislike on suggested outfits
 * nudges a small taste vector in localStorage so future rankings prefer
 * similar pieces and avoid disliked combos.
 */

import { EMBED_DIM, embedItem } from "./style-embed";
import type { WardrobeItem } from "./types";

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
    if (mismatchedPair) {
      const key = [...mismatchedPair].sort().join("|");
      if (!t.badPairs.includes(key)) t.badPairs = [...t.badPairs, key].slice(-80);
    }
  }
  writeTaste(t);
  return t;
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
