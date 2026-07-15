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
const HF_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

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

interface SegMask {
  label: string;
  score: number;
  mask: string; // base64 PNG, white = that class
}

/** Call the segmentation provider with raw image bytes → per-class masks. */
async function runSegmentation(bytes: Buffer): Promise<SegMask[]> {
  const key = process.env.HUGGINGFACE_API_KEY;
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

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  if (!process.env.HUGGINGFACE_API_KEY) {
    return Response.json({ error: "Garment cutout not configured." }, { status: 501 });
  }

  let body: { imageUrl?: string; imageData?: string; category?: string };
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

  // Segment.
  let masks: SegMask[];
  try {
    masks = await runSegmentation(src);
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json({ error: msg }, { status: msg === "no-key" ? 501 : 502 });
  }

  // Pick the label masks for this category (union), then max-merge into one grayscale mask.
  const wanted = new Set(
    (body.category && CLASS_MAP[body.category]) ?? ALL_CLOTHING,
  );
  const chosen = masks.filter((m) => wanted.has(m.label) && m.mask);
  if (chosen.length === 0) {
    return Response.json({ error: "No garment found for that category." }, { status: 422 });
  }

  try {
    const meta = await sharp(src).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return Response.json({ error: "Unreadable image." }, { status: 502 });

    // Max-merge the selected masks into a single WxH grayscale buffer.
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

    // Empty/near-empty mask → let the client fall back to @imgly.
    let sum = 0;
    for (let i = 0; i < merged.length; i++) sum += merged[i];
    if (sum / merged.length < 2) {
      return Response.json({ error: "Empty garment mask." }, { status: 422 });
    }

    // Apply the merged mask as the alpha channel: decode to raw RGB and interleave
    // (RGB + mask → RGBA). joinChannel/dest-in don't reliably use grayscale as alpha.
    const { data: rgb } = await sharp(src)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = W * H;
    const rgba = Buffer.alloc(px * 4);
    for (let i = 0; i < px; i++) {
      rgba[i * 4] = rgb[i * 3];
      rgba[i * 4 + 1] = rgb[i * 3 + 1];
      rgba[i * 4 + 2] = rgb[i * 3 + 2];
      rgba[i * 4 + 3] = merged[i];
    }
    const png = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toBuffer();

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json({ error: `Compositing failed: ${(e as Error).message}` }, { status: 500 });
  }
}
