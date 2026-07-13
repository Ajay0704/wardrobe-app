/**
 * Image embeddings for the shop feeds (AJA-97). One model embeds both the
 * grabbed-garment crop (/api/detect) and the catalog images, so garments and
 * products are comparable by the same nearest-neighbor query.
 *
 * Model: Hugging Face SigLIP (768-d). When HF_TOKEN is absent — or any call
 * fails — we fall back to a DETERMINISTIC stub vector so the whole pipeline
 * runs in dev: the category/compat filters in the RPCs still give correct
 * grouping; only the within-category visual ordering is placeholder until a
 * token is set. Swap nothing in the callers when the token lands.
 */

export const EMBED_DIM = 768;
const HF_MODEL = process.env.HF_EMBED_MODEL || "google/siglip-base-patch16-224";

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
  // xorshift32 seeded by a cheap string hash → reproducible pseudo-random dirs.
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

/** HF feature-extraction can return number[] or number[][] (per-token) — pool to one vector. */
function poolToVector(data: unknown): number[] | null {
  if (Array.isArray(data) && typeof data[0] === "number") return data as number[];
  if (Array.isArray(data) && Array.isArray(data[0])) {
    const rows = data as number[][];
    const dim = rows[0].length;
    const acc = new Array(dim).fill(0);
    for (const r of rows) for (let i = 0; i < dim; i++) acc[i] += r[i];
    return acc.map((x) => x / rows.length);
  }
  return null;
}

async function embedViaHF(bytes: Buffer, contentType: string, seed: string): Promise<number[]> {
  const token = process.env.HF_TOKEN;
  if (!token) return stubVector(seed);
  try {
    const resp = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
        Accept: "application/json",
      },
      body: new Uint8Array(bytes),
    });
    if (!resp.ok) {
      console.warn(`[embed] HF ${resp.status}; falling back to stub`);
      return stubVector(seed);
    }
    const vec = poolToVector(await resp.json());
    if (!vec) {
      console.warn("[embed] unexpected HF shape; stub");
      return stubVector(seed);
    }
    if (vec.length !== EMBED_DIM) {
      console.warn(`[embed] HF dim ${vec.length} != ${EMBED_DIM}; stub`);
      return stubVector(seed);
    }
    return l2normalize(vec);
  } catch (e) {
    console.warn("[embed] HF error; stub:", (e as Error).message);
    return stubVector(seed);
  }
}

/** Embed already-fetched image bytes (e.g. a server-side crop). */
export async function embedImageBytes(bytes: Buffer, contentType = "image/jpeg"): Promise<number[]> {
  return embedViaHF(bytes, contentType, bytes.toString("base64").slice(0, 96));
}

/** Fetch an image URL and embed it. Used for catalog backfill. */
export async function embedImageFromUrl(url: string): Promise<number[]> {
  if (!process.env.HF_TOKEN) return stubVector(url);
  try {
    const img = await fetch(url);
    if (!img.ok) return stubVector(url);
    const buf = Buffer.from(await img.arrayBuffer());
    return embedViaHF(buf, img.headers.get("content-type") || "image/jpeg", url);
  } catch {
    return stubVector(url);
  }
}
