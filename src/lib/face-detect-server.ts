/**
 * AJA-278 — server-side head detection + crop for the try-on `faceImage` slot.
 *
 * Node-only (`sharp`). Named `-server` like `auth-server.ts` so it can't be pulled
 * into a client bundle by accident.
 *
 * The `faceImage` slot has existed since AJA-274, fully wired through the route and
 * the prompt (`ID_WITH_FACE`), with no caller — so `ID_PHOTO_ONLY` always ran. This
 * fills it, from the photo the user already gave us, with no new user input and no new
 * storage: the win measured in AJA-274 came from raising facial pixel density by
 * CROPPING, not from new pixels.
 *
 * Every failure path returns null, and the caller renders exactly as it does today.
 * A wrong crop presented as "the authority on their identity" is worse than none.
 */
import sharp from "sharp";
import { toBox, type NormBox } from "./gemini-box";
import { faceAreaFraction, faceCropBox, subjectHead } from "./face-crop";

/** Base64 inline image, matching the try-on route's part shape. */
export interface InlineImage {
  mimeType: string;
  data: string;
}

/** Cheap and fast; this is a box, not a judgement. Same model as detect-garments. */
const DETECT_MODEL = "gemini-3.5-flash";

/**
 * Detection must not eat the render's budget. The route allows 45s for the image call
 * inside a 60s function, so this is deliberately tight — a slow detection is skipped,
 * not waited for.
 */
const DETECT_TIMEOUT_MS = 8_000;

/** Re-encode quality for the crop. High, because this image exists to carry detail. */
const CROP_QUALITY = 92;

/**
 * One face box per source image, cached across requests.
 *
 * Changing scene re-renders the same photo, and without this each scene would pay for
 * its own detection. Serverless instances are reused often enough for this to pay off,
 * and it is bounded so a long-lived instance can't grow unboundedly.
 */
const CACHE_LIMIT = 24;
const cache = new Map<string, DetectedFace | null>();

export interface DetectedFace {
  crop: InlineImage;
  /** Face area as a fraction of the ORIGINAL photo — the "before" number. */
  areaBefore: number;
  /** Face area as a fraction of the crop — the "after" number. */
  areaAfter: number;
  cropPx: number;
}

/** Stable-enough key for an inline image without hashing megabytes of base64. */
function cacheKey(img: InlineImage): string {
  const d = img.data;
  return `${img.mimeType}:${d.length}:${d.slice(0, 64)}:${d.slice(-64)}`;
}

function remember(key: string, value: DetectedFace | null): DetectedFace | null {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/**
 * Ask Gemini for every human head box in the image, 0-1000 coords.
 *
 * Returns ALL of them so the ambiguity rule below is applied in code rather than
 * delegated to the model — "pick the main person" is exactly the sort of instruction a
 * model answers confidently and wrongly.
 */
async function detectHeadBoxes(img: InlineImage, key: string): Promise<NormBox[]> {
  const prompt =
    "Locate every HUMAN HEAD in this photograph. A head box covers the face plus the " +
    "hair, from the top of the hair to the bottom of the chin. Ignore heads that appear " +
    "on printed garment graphics, posters, screens or reflections — only real people " +
    'physically present. Reply with JSON only: {"heads": [{"box_2d": [ymin, xmin, ymax, ' +
    'xmax]}]} using integers 0-1000. If there is no clearly visible human head, reply ' +
    '{"heads": []}.';

  let resp: Response;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${DETECT_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: prompt }, { inline_data: { mime_type: img.mimeType, data: img.data } }] },
          ],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
      },
    );
  } catch {
    return [];
  }
  if (!resp.ok) return [];

  try {
    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return [];
    const text = parts
      .filter((p: { thought?: boolean }) => !p.thought)
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    const parsed = JSON.parse(text);
    const heads = Array.isArray(parsed?.heads) ? parsed.heads : [];
    return heads
      .map((h: { box_2d?: unknown }) => toBox(h?.box_2d))
      .filter((b: NormBox | null): b is NormBox => b !== null);
  } catch {
    return [];
  }
}

/**
 * Produce a square face crop for `image`, or null to render without one.
 *
 * `image` is the person reference already decoded by the caller, so detection sees
 * exactly the pixels the render will see.
 */
export async function detectFaceCrop(
  image: InlineImage,
  apiKey: string,
): Promise<DetectedFace | null> {
  const key = cacheKey(image);
  if (cache.has(key)) return cache.get(key) ?? null;

  // ONE coordinate space for everything. `metadata()` reports PRE-rotation dimensions,
  // so reading them and then cropping a `.rotate()`d pipeline silently crops the wrong
  // region of an EXIF-rotated phone photo. Bake the rotation in first, then measure,
  // detect and extract all against the same normalized bytes.
  let normalized: Buffer;
  let width: number | undefined;
  let height: number | undefined;
  try {
    normalized = await sharp(Buffer.from(image.data, "base64")).rotate().toBuffer();
    ({ width, height } = await sharp(normalized).metadata());
  } catch {
    return remember(key, null);
  }
  if (!width || !height) return remember(key, null);

  // Detect against the normalized image too, so the returned boxes share that space.
  const head = subjectHead(
    await detectHeadBoxes({ mimeType: image.mimeType, data: normalized.toString("base64") }, apiKey),
  );
  if (!head) return remember(key, null);

  const rect = faceCropBox(head, width, height);
  if (!rect) return remember(key, null);

  let out: Buffer;
  try {
    out = await sharp(normalized).extract(rect).jpeg({ quality: CROP_QUALITY }).toBuffer();
  } catch {
    return remember(key, null);
  }

  return remember(key, {
    crop: { mimeType: "image/jpeg", data: out.toString("base64") },
    areaBefore: faceAreaFraction(head, null, width, height),
    areaAfter: faceAreaFraction(head, rect, width, height),
    cropPx: rect.width,
  });
}
