/**
 * AJA-301 — image embeddings from Gemini Embedding 2, for "you already own something
 * that looks like this".
 *
 * Node-only (`sharp`). Named `-server` like `face-detect-server.ts` so it can't be
 * pulled into a client bundle by accident.
 *
 * Deliberately NOT `embed.ts`: that stub's vectors are matched in SQL against stub
 * vectors already stored in `shop_products`, so making it real would silently scramble
 * the (currently unreachable) photo-detail feeds. Different consumer, different module.
 *
 * Every failure is a null, never a throw: the caller falls back to the colour heuristic
 * and the user sees exactly what they saw before.
 */
import sharp from "sharp";
import { safeFetch } from "./net";
import { VISUAL_DIM, VISUAL_MAX_INLINE_CHARS, VISUAL_MODEL } from "./visual-similarity";

/** One rate-limit unit buys at most this many images. */
const MAX_ITEMS = 16;
const MAX_ID_CHARS = 128;
const MAX_URL_CHARS = 4096;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

export interface EmbedItem {
  id: string;
  src: string;
}

/**
 * The route's body, validated: 1–16 `{id, src}`, with `src` an https URL or an inline
 * image. Anything else refuses the whole batch — the client only ever sends this shape.
 */
export function parseEmbedItems(body: unknown): EmbedItem[] | null {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS) return null;
  const out: EmbedItem[] = [];
  for (const raw of items) {
    const { id, src } = (raw ?? {}) as { id?: unknown; src?: unknown };
    if (typeof id !== "string" || !id || id.length > MAX_ID_CHARS || typeof src !== "string") return null;
    const fits = src.startsWith("https://")
      ? src.length <= MAX_URL_CHARS
      : src.startsWith("data:image/") && src.length <= VISUAL_MAX_INLINE_CHARS;
    if (!fits) return null;
    out.push({ id, src });
  }
  return out;
}

/**
 * The bytes behind a source: an inline image is decoded; a URL goes through `safeFetch`
 * (no private hosts, re-checked redirects) with a timeout, an image content type and a
 * size cap. Null on anything unexpected — a retailer that blocks us is not an error.
 */
export async function loadImageBytes(src: string): Promise<Uint8Array | null> {
  try {
    if (src.startsWith("data:")) {
      const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(src);
      if (!m) return null;
      const bytes = Buffer.from(m[1], "base64");
      return bytes.length && bytes.length <= MAX_IMAGE_BYTES ? new Uint8Array(bytes) : null;
    }
    const res = await safeFetch(src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const type = res.headers.get("content-type") ?? "";
    // Some CDNs serve images as octet-stream; sharp rejects anything that isn't one.
    if (!res.ok || !(type.startsWith("image/") || type.includes("octet-stream"))) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length && bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${VISUAL_MODEL}:batchEmbedContents`;
const EMBED_TIMEOUT_MS = 15_000;
/** Embedding needs the garment, not the pixels: a phone photo shrinks to this. */
const MAX_SIDE = 512;
/** Refuse decompression bombs before decoding them. 40 MP covers any real phone photo. */
const MAX_PIXELS = 40_000_000;
/** Transparent cut-outs are flattened onto this, so they compare with product shots on white. */
const FLATTEN_BG = "#ffffff";

/**
 * Any garment image → a small JPEG, base64. EXIF-rotated (phone photos), transparency
 * flattened, long side ≤ MAX_SIDE. Null when it can't be decoded or is too large.
 */
export async function prepImage(bytes: Uint8Array): Promise<string | null> {
  try {
    const out = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .flatten({ background: FLATTEN_BG })
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

/**
 * One `batchEmbedContents` call for every prepared image; a null input stays null and is
 * never sent. Results come back unit-length and in input order.
 *
 * One sub-request per image: several image parts in a single request are merged into
 * ONE vector. `outputDimensionality` must be set — without it the API answers 3072 dims
 * (confirmed against the live API) — and any vector of the wrong size is dropped rather
 * than trusted.
 */
export async function embedImages(
  images: (string | null)[],
  apiKey: string,
  opts: { timeoutMs?: number } = {},
): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = images.map(() => null);
  const sent = images.flatMap((img, i) => (img ? [i] : []));
  if (!apiKey || !sent.length) return out;
  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        requests: sent.map((i) => ({
          model: `models/${VISUAL_MODEL}`,
          content: { parts: [{ inline_data: { mime_type: "image/jpeg", data: images[i] } }] },
          outputDimensionality: VISUAL_DIM,
        })),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? EMBED_TIMEOUT_MS),
    });
    if (!resp.ok) return out;
    const embeddings = (await resp.json())?.embeddings;
    // A short answer can't be mapped back with confidence — which image is missing?
    if (!Array.isArray(embeddings) || embeddings.length !== sent.length) return out;
    sent.forEach((i, k) => {
      out[i] = unitVector(embeddings[k]?.values);
    });
  } catch {
    /* network, timeout, unparseable body — the caller keeps the heuristic */
  }
  return out;
}

function unitVector(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length !== VISUAL_DIM) return null;
  let sum = 0;
  for (const x of values) {
    if (typeof x !== "number" || !Number.isFinite(x)) return null;
    sum += x * x;
  }
  const n = Math.sqrt(sum);
  return n ? values.map((x: number) => x / n) : null;
}
