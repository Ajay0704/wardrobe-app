/**
 * Garment-only cutout (AJA-118). Runs a clothes-segmentation model, keeps the mask for the
 * garment class implied by the item's category, and applies it as the alpha channel — so the
 * result is JUST the garment (not the whole person, unlike @imgly background removal).
 *
 * Provider is abstracted behind runSegmentation() (default: HuggingFace Inference API,
 * mattmdjaga/segformer_b2_clothes) so Replicate/fal can swap in. Returns transparent PNG bytes;
 * the client re-hosts via resolveImageSource, matching the existing cutout flow. Any failure
 * (missing key, provider error, empty mask) returns a non-2xx so the client falls back to @imgly.
 */
import { requireUser } from "@/lib/auth-server";
import { safeFetch } from "@/lib/net";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

const HF_MODEL = "mattmdjaga/segformer_b2_clothes";
// HF migrated the classic api-inference.huggingface.co host to the Inference Providers router.
const HF_URL = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`;
/** Accept either env name for the HuggingFace token. */
const HF_KEY = () => process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;

/** ATR/human-parsing labels kept per wardrobe category. */
const CLASS_MAP: Record<string, string[]> = {
  top: ["Upper-clothes"],
  outerwear: ["Upper-clothes"], // model has no separate coat class
  bottom: ["Pants", "Skirt"],
  dress: ["Dress"],
  shoes: ["Left-shoe", "Right-shoe"],
  bag: ["Bag"],
  accessory: ["Hat", "Sunglasses", "Scarf", "Belt"],
};
/** Fallback when category is unknown: all clothing, excluding skin/hair/face/background. */
const ALL_CLOTHING = [
  "Upper-clothes", "Skirt", "Pants", "Dress", "Belt",
  "Left-shoe", "Right-shoe", "Bag", "Hat", "Scarf", "Sunglasses",
];

/**
 * Multi-split groups: one emitted item per group with a non-empty mask. Splits of a single
 * garment are merged (Left+Right-shoe → a pair; Pants/Skirt → one bottom); distinct accessories
 * stay separate (a hat is not a belt). Order also sets a sensible default z-order in the UI.
 */
const GARMENT_GROUPS: { category: string; labels: string[] }[] = [
  { category: "bottom", labels: ["Pants", "Skirt"] },
  { category: "dress", labels: ["Dress"] },
  { category: "top", labels: ["Upper-clothes"] },
  { category: "shoes", labels: ["Left-shoe", "Right-shoe"] },
  { category: "bag", labels: ["Bag"] },
  { category: "accessory", labels: ["Hat"] },
  { category: "accessory", labels: ["Sunglasses"] },
  { category: "accessory", labels: ["Scarf"] },
  { category: "accessory", labels: ["Belt"] },
];

interface SegMask {
  label: string;
  score: number;
  mask: string; // base64 PNG, white = that class
}

/** Call the segmentation provider with raw image bytes → per-class masks. */
async function runSegmentation(bytes: Buffer): Promise<SegMask[]> {
  const key = HF_KEY();
  if (!key) throw new Error("no-key");
  const resp = await fetch(HF_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/octet-stream",
      "x-wait-for-model": "true",
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) {
    const detail = (await resp.text().catch(() => "")).slice(0, 300);
    throw new Error(`segmentation ${resp.status}: ${detail}`);
  }
  return (await resp.json()) as SegMask[];
}

/**
 * Max-merge the masks for the given labels into one WxH grayscale buffer, with the mean intensity
 * so callers can apply the empty-mask guard. Returns null when no matching mask is present.
 */
async function mergeMasks(
  masks: SegMask[],
  labels: Set<string>,
  W: number,
  H: number,
): Promise<{ merged: Buffer; mean: number } | null> {
  const chosen = masks.filter((m) => labels.has(m.label) && m.mask);
  if (chosen.length === 0) return null;
  const merged = Buffer.alloc(W * H, 0);
  for (const m of chosen) {
    const gray = await sharp(Buffer.from(m.mask, "base64"))
      .resize(W, H, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();
    for (let i = 0; i < merged.length; i++) {
      if (gray[i] > merged[i]) merged[i] = gray[i];
    }
  }
  let sum = 0;
  for (let i = 0; i < merged.length; i++) sum += merged[i];
  return { merged, mean: sum / merged.length };
}

/** Apply a grayscale mask as the alpha channel of the source (manual RGBA interleave). */
async function compositeAlpha(src: Buffer, merged: Buffer, W: number, H: number): Promise<Buffer> {
  const { data: rgb } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = W * H;
  const rgba = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = merged[i];
  }
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

/** A mask is meaningfully present when its mean intensity clears this threshold. */
const MASK_MIN_MEAN = 2;

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  if (!HF_KEY()) {
    return Response.json({ error: "Garment cutout not configured." }, { status: 501 });
  }

  let body: {
    imageUrl?: string;
    imageData?: string;
    category?: string;
    mode?: "single" | "multi";
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Source image → Buffer (safeFetch for remote URLs; decode data URLs directly).
  let src: Buffer;
  try {
    if (body.imageData?.startsWith("data:")) {
      src = Buffer.from(body.imageData.split(",")[1] ?? "", "base64");
    } else if (body.imageUrl) {
      const res = await safeFetch(body.imageUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return Response.json({ error: "Could not load image." }, { status: 502 });
      src = Buffer.from(await res.arrayBuffer());
    } else {
      return Response.json({ error: "imageUrl or imageData required." }, { status: 400 });
    }
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg.startsWith("blocked") ? 400 : 502;
    return Response.json({ error: `Image fetch failed: ${msg}` }, { status });
  }

  // Normalize EXIF orientation so our pixel space matches the model's (PIL auto-rotates;
  // sharp does not). Feed the SAME normalized bytes to both segmentation and compositing,
  // or the mask lands on the wrong region.
  try {
    src = await sharp(src).rotate().toBuffer();
  } catch {
    /* keep original bytes if rotate fails */
  }

  // Segment.
  let masks: SegMask[];
  try {
    masks = await runSegmentation(src);
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json({ error: msg }, { status: msg === "no-key" ? 501 : 502 });
  }

  try {
    const meta = await sharp(src).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return Response.json({ error: "Unreadable image." }, { status: 502 });

    // ---- Multi mode: one cutout per non-empty garment group → JSON. Single path untouched.
    if (body.mode === "multi") {
      const cutouts: { category: string; pngBase64: string }[] = [];
      for (const group of GARMENT_GROUPS) {
        const m = await mergeMasks(masks, new Set(group.labels), W, H);
        if (!m || m.mean < MASK_MIN_MEAN) continue; // skip empty classes → no junk items
        const png = await compositeAlpha(src, m.merged, W, H);
        cutouts.push({ category: group.category, pngBase64: png.toString("base64") });
      }
      if (cutouts.length === 0) {
        return Response.json({ error: "No garments found in that photo." }, { status: 422 });
      }
      return Response.json({ cutouts });
    }

    // ---- Single mode (default): the item's category (or all clothing) → one binary PNG.
    const wanted = new Set((body.category && CLASS_MAP[body.category]) ?? ALL_CLOTHING);
    const merged = await mergeMasks(masks, wanted, W, H);
    if (!merged || merged.mean < MASK_MIN_MEAN) {
      // Empty/near-empty mask → let the client fall back to @imgly.
      return Response.json({ error: "Empty garment mask." }, { status: 422 });
    }
    const png = await compositeAlpha(src, merged.merged, W, H);
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json({ error: `Compositing failed: ${(e as Error).message}` }, { status: 500 });
  }
}
