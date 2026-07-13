/**
 * Image embeddings for the shop feeds (AJA-97).
 *
 * Slice 1 uses a DETERMINISTIC STUB. HF's serverless tier does not serve image
 * feature-extraction for SigLIP/CLIP ("Model not supported by provider
 * hf-inference"), so there is no free HF path for real image embeddings — and
 * calling the dead endpoint on every /api/detect just adds latency. The stub
 * keeps the whole pipeline correct: the match_similar / match_complements RPCs
 * still filter by category + outfit_compat, so results are grouped right; only
 * within-category *visual* ranking is placeholder.
 *
 * Slice 2 wires a real provider (Replicate CLIP / Cohere / Jina) by replacing
 * the two embed functions below. The DB (halfvec(768)), the RPCs, and every
 * caller stay the same — only set EMBED_DIM to the chosen model's dimension.
 */

export const EMBED_DIM = 768;

/** Postgres vector/halfvec literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

function l2normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

/** Deterministic unit vector seeded by a string — stable across calls. */
function stubVector(seed: string): number[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const out = new Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    out[i] = (h / 4294967295) * 2 - 1;
  }
  return l2normalize(out);
}

/** Embed image bytes (a server-side crop). Slice 2: call the real model here. */
export async function embedImageBytes(bytes: Buffer): Promise<number[]> {
  return stubVector(bytes.toString("base64").slice(0, 96));
}

/** Embed an image URL (catalog backfill). Slice 2: call the real model here. */
export async function embedImageFromUrl(url: string): Promise<number[]> {
  return stubVector(url);
}
