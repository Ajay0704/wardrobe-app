/**
 * AJA-301 — "does this LOOK like something you own", from image embeddings.
 *
 * Should-I-Buy's duplicate check was category + colour, which called a black hoodie a
 * second black tee. Gemini Embedding 2 vectors compare what the garments look like.
 *
 * Pure and isomorphic: the client index, the smart-buy check and the tests all run it,
 * so nothing here touches Node or the DOM beyond btoa/atob.
 *
 * Vectors are stored as int8, one byte per dimension: 1 KB of base64 instead of ~16 KB
 * of JSON floats. Each piece is quantised with its own scale, which is safe because
 * cosine is scale-invariant — the scales cancel.
 */
import { isSampleItem } from "./demo-data";
import type { WardrobeItem } from "./types";

/** Gemini Embedding 2: one space for every image we compare. Other models' vectors are incompatible. */
export const VISUAL_MODEL = "gemini-embedding-2";
export const VISUAL_DIM = 768;

/**
 * Cosine at or above which two same-category pieces read as "a second one of the same
 * thing" — paired in smart-buy with a colour veto, because the model is weak on colour.
 *
 * TUNE: scripts/calibrate-visual-dupes.mts on the 16 public sample garments (white
 * retailer-style shot vs closet cut-out, 768 dims, flattened on white). True
 * near-duplicates scored ≥ 0.856; with the veto the strongest other pair was 0.668, and
 * without it navy vs camel sweater reached 0.770 and taupe vs olive trousers 0.838.
 * 0.78 sits nearer the positives: a false "you own one of these" also skews the budget
 * advice. Clean renders flatter the model — real photos score lower, so retune on real
 * closets before tightening.
 */
export const VISUAL_DUP_COS = 0.78;

/** Base64 of an int8 vector, scaled so its largest component is ±127. */
export function quantizeVector(vec: number[]): string {
  let max = 0;
  for (const x of vec) if (Number.isFinite(x)) max = Math.max(max, Math.abs(x));
  if (!max) return "";
  let bin = "";
  for (const x of vec) {
    const q = Number.isFinite(x) ? Math.round((x / max) * 127) : 0;
    bin += String.fromCharCode(q & 0xff);
  }
  return btoa(bin);
}

const decoded = new Map<string, Int8Array | null>();

/**
 * The stored vector, or null when it isn't exactly VISUAL_DIM bytes. A wrong size is the
 * failure that matters: the API answers 3072 dims when the size parameter is misplaced,
 * and a vector of the wrong size compared against the right ones is noise, not an error.
 */
export function decodeVector(b64: string): Int8Array | null {
  if (!b64) return null;
  const hit = decoded.get(b64);
  if (hit !== undefined) return hit;
  let out: Int8Array | null = null;
  try {
    const bin = atob(b64);
    if (bin.length === VISUAL_DIM) {
      out = new Int8Array(VISUAL_DIM);
      for (let i = 0; i < VISUAL_DIM; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24;
    }
  } catch {
    out = null;
  }
  if (decoded.size > 4000) decoded.clear();
  decoded.set(b64, out);
  return out;
}

export function cosine(a: Int8Array, b: Int8Array): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * The longest inline image /api/embed accepts. Shared so the client never picks one the
 * route would refuse — an oversized piece would sink its whole batch of 16 into backoff.
 * Far past anything stored inline anyway: heal.ts scrubs inline images over 200k chars.
 */
export const VISUAL_MAX_INLINE_CHARS = 500_000;

const usable = (src: string | undefined): src is string =>
  !!src &&
  (src.startsWith("https://") || (src.startsWith("data:image/") && src.length <= VISUAL_MAX_INLINE_CHARS));

/**
 * The image a piece is judged by. The cut-out first: beautified tops keep an AI redraw
 * in `imageUrl` and the real garment in `cutoutImageUrl`. Starter samples are never
 * judged — they share line drawings, so every one would "match" its neighbours.
 * `blob:` and relative URLs can't be fetched server-side, so they don't count either.
 */
export function visualSource(
  it: Pick<WardrobeItem, "id" | "imageUrl" | "cutoutImageUrl">,
): string | null {
  if (isSampleItem(it)) return null;
  const cut = it.cutoutImageUrl?.trim();
  if (usable(cut)) return cut;
  const img = it.imageUrl?.trim();
  return usable(img) ? img : null;
}

const hashes = new Map<string, string>();

/** Short, stable fingerprint of an image source (cyrb53). Keys an index entry to ONE image. */
export function srcHash(src: string): string {
  const hit = hashes.get(src);
  if (hit) return hit;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const out = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  if (hashes.size > 4000) hashes.clear();
  hashes.set(src, out);
  return out;
}

/** One indexed piece: the hash of the image embedded, and its vector. */
export interface VisualEntry {
  h: string;
  v: string;
}

/**
 * A lookup that only answers for the image a vector came from. Change a piece's photo
 * and its old vector stops counting at once — no race to clean it up.
 */
export function makeVisualLookup(
  entries: Record<string, VisualEntry>,
): (it: Pick<WardrobeItem, "id" | "imageUrl" | "cutoutImageUrl">) => Int8Array | null {
  return (it) => {
    const e = entries[it.id];
    const src = e ? visualSource(it) : null;
    if (!e || !src || e.h !== srcHash(src)) return null;
    return decodeVector(e.v);
  };
}
