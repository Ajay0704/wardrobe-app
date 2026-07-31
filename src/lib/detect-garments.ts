/**
 * Client side of the whole-outfit detector. Detects every garment in one photo,
 * crops each box out of the ORIGINAL local data URL, cuts it out, and tags it.
 *
 * Detector chain: Grounding DINO on Replicate (/api/segment-outfit — reliable,
 * boxes only) → Gemini boxes (/api/detect-garments — boxes + attributes). Cropping
 * uses the local data URL (not a re-hosted https URL) so the canvas is never tainted
 * by cross-origin pixels. Returns fully-attributed garments; on any failure returns
 * [] so callers can fall back to SegFormer (cutoutMulti) or single-add.
 */

import { cutout } from "./cutout";
import { authHeaders } from "./supabase/client";
import { dataUrlToFile, resolveImageSource } from "./supabase/storage";
import type { Category, Season } from "./types";
import { mergeAttrs, readAnalyzedAttrs, type AnalyzedAttrs } from "./analyze-attrs";

export interface DetectedGarment extends AnalyzedAttrs {
  category: Category;
  name: string;
  color: string;
  colorName?: string;
  seasons: Season[];
  tags: string[];
  /** Re-hosted transparent PNG (cutout), or the crop data URL if cutout failed. */
  url: string;
  /**
   * Which background remover produced `url` — e.g. "applevision@vision17" or "imgly@1.7.0", or
   * "raw-crop@no-cutout" when removal failed and the bare crop was kept.
   *
   * `cutout()` has always returned this and this function has always discarded it, which made the
   * whole add-by-photo path unable to say what produced any of its items: 188 of 191 items in a
   * real closet carried no engine at all. That is not cosmetic — the Apple Vision engine degrades
   * to imgly silently by design, so without this an unreachable native plugin is indistinguishable
   * from a working one, and that cost a full day of device round-trips to diagnose (AJA-273).
   */
  cutoutEngine?: string;
}

interface ApiGarment extends AnalyzedAttrs {
  category: Category;
  box: { x: number; y: number; w: number; h: number };
  name?: string;
  color?: string;
  colorName?: string;
  seasons: Season[];
  tags: string[];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.src = src;
  });
}

/**
 * Shrink + re-encode an image to a JPEG data URL for the detection request.
 * Full-res phone photos (often multi-MB HEIC/JPEG) exceed the serverless body
 * limit once base64-encoded, so the request would fail and we'd fall back to a
 * single cutout. Downscaling keeps the payload small and turns HEIC into JPEG;
 * detection returns normalized boxes, so we still crop from the full-res image.
 */
/** Longest edge sent to the detector. Shared with `MIN_CROP_PX`, which is calibrated at it. */
const DETECT_MAX_DIM = 1400;

function downscaleForDetect(img: HTMLImageElement, maxDim = DETECT_MAX_DIM, quality = 0.85): string {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Smallest crop worth keeping, measured at DETECT_MAX_DIM scale (see below for why).
 *
 * The detector reliably emits slivers for garments half out of frame — across 12 real photos it
 * produced 11 of them, things like a 20x14 "accessory" and a 35x20 "shoes". Each becomes a junk
 * closet item AND costs a cutout, a tag and a redraw; they were ~22% of the redraws in that run.
 *
 * The guard has to live here rather than in `toBox()` on the server: that function works in
 * normalized 0-1 coordinates and only rejects boxes under 1% of each dimension, which on a
 * 468x550 image is about 5x6 pixels. It cannot express a size floor because it never sees the
 * pixels.
 *
 * Measured at detect scale, not natural scale. The threshold was calibrated on images downscaled
 * to `DETECT_MAX_DIM`, while cropping here happens at NATURAL resolution (deliberately, so crops
 * stay sharp) — so a flat 48 would be ~1.8x more permissive on a 2526px screenshot than on the
 * images it was tuned against.
 *
 * Two honest caveats on the value itself:
 *
 * - The margin is thin. Across 86 real boxes the largest rejected sliver had a 41px short side
 *   and the smallest kept garment 48px — 1.17x apart. Area does NOT separate them at all (the
 *   smallest real crop is 2,928px², smaller than the largest sliver at 4,655px²), which is why
 *   this tests the short side rather than area.
 * - That 48px floor on the smallest kept garment exists BY CONSTRUCTION: the calibration run
 *   filtered at 48, so anything below it was never recorded. Whether real garments live between
 *   41 and 48 is unmeasured. If users report missing belts, scarves or straps from wide shots,
 *   this is the first number to lower.
 */
const MIN_CROP_PX = 48;

/** Crop a normalized box (with a little padding) out of an image to a JPEG data URL. */
function cropBox(img: HTMLImageElement, box: ApiGarment["box"], pad = 0.06): string | null {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return null;
  const x0 = Math.max(0, (box.x - box.w * pad) * W);
  const y0 = Math.max(0, (box.y - box.h * pad) * H);
  const x1 = Math.min(W, (box.x + box.w * (1 + pad)) * W);
  const y1 = Math.min(H, (box.y + box.h * (1 + pad)) * H);
  const cw = Math.round(x1 - x0);
  const ch = Math.round(y1 - y0);
  // Judge the size at detect scale, not natural scale, so the threshold is resolution-independent.
  const detectScale = Math.min(1, DETECT_MAX_DIM / Math.max(W, H));
  if (cw * detectScale < MIN_CROP_PX || ch * detectScale < MIN_CROP_PX) return null;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, Math.round(x0), Math.round(y0), cw, ch, 0, 0, cw, ch);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Primary detector: Grounding DINO on Replicate. Boxes + category only. */
async function segmentViaReplicate(detectUrl: string): Promise<ApiGarment[]> {
  try {
    const res = await fetch("/api/segment-outfit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ image: detectUrl }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { garments?: { category: Category; box: ApiGarment["box"] }[] };
    return (data.garments ?? []).map((g) => ({ category: g.category, box: g.box, seasons: [], tags: [] }));
  } catch {
    return [];
  }
}

/** Fallback detector: Gemini boxes — returns attributes inline too. */
async function detectViaGemini(detectUrl: string): Promise<ApiGarment[]> {
  try {
    const res = await fetch("/api/detect-garments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ image: detectUrl }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { garments?: ApiGarment[] };
    return data.garments ?? [];
  } catch {
    return [];
  }
}

/**
 * Tag a single cutout. This runs on a tight crop of one garment, which is the only place
 * a chest logo or woven label is legible — the detector sees the whole photo downscaled.
 * It must keep every attribute the endpoint returns: keeping five of thirteen is what
 * silently dropped brand on every scan (AJA-246).
 */
async function analyzeCutout(url: string): Promise<Partial<ApiGarment>> {
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ image: url }),
    });
    if (!res.ok) return {};
    const d = (await res.json()) as Record<string, unknown>;
    return {
      ...readAnalyzedAttrs(d),
      name: typeof d.name === "string" ? d.name : undefined,
      color: typeof d.color === "string" ? d.color : undefined,
      colorName: typeof d.colorName === "string" ? d.colorName : undefined,
      seasons: Array.isArray(d.seasons) ? (d.seasons as Season[]) : undefined,
      tags: Array.isArray(d.tags) ? (d.tags as string[]) : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Detect every garment in one photo and return them as cut-out, attributed items.
 * `dataUrl` MUST be a local data: URL (from the picked/captured file).
 */
export async function detectGarments(
  dataUrl: string,
  userId: string | null,
  /** How many garment cutouts to run at once. The on-device background removal (imgly WASM)
   *  is CPU-heavy, so the background import passes 1 to keep the app responsive; the foreground
   *  "add whole outfit" flow keeps the default 2 for speed. */
  maxWorkers = 2,
): Promise<DetectedGarment[]> {
  // Load once; detect on a downscaled copy, but crop from the full-res original.
  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    return [];
  }
  const detectUrl = downscaleForDetect(img);

  // Replicate first (best), Gemini as fallback.
  let garments = await segmentViaReplicate(detectUrl);
  if (!garments.length) garments = await detectViaGemini(detectUrl);
  if (!garments.length) return [];

  const out: DetectedGarment[] = [];
  // Limited concurrency so on-device cutout + tagging don't stall the UI.
  let i = 0;
  const worker = async () => {
    while (i < garments.length) {
      const g = garments[i++];
      const crop = cropBox(img, g.box);
      if (!crop) continue;
      let url = crop;
      let cutoutEngine: string | undefined;
      try {
        const cut = await cutout(crop, userId, { category: g.category });
        url = cut.url;
        cutoutEngine = cut.engine;
      } catch {
        // Background removal failed — still re-host the raw crop to Storage so we never
        // persist a multi-MB base64 data URL (AJA-233 P2): inline images freeze the UI on
        // the synchronous localStorage write AND blow past MAX_SNAPSHOT_CHARS so the sync
        // push is blocked → the item silently never reaches the server. Signed out → a
        // compressed data URL as a last resort.
        try {
          url = await resolveImageSource(dataUrlToFile(crop, "crop.jpg"), userId);
        } catch {
          url = crop;
        }
        // Recorded explicitly rather than left blank, so "removal failed on this item" stays
        // distinguishable from "this item predates engine recording".
        cutoutEngine = "raw-crop@no-cutout";
      }
      let name = g.name?.trim() || "";
      let color = g.color;
      let colorName = g.colorName;
      let seasons = g.seasons ?? [];
      let tags = g.tags ?? [];
      let attrs = readAnalyzedAttrs(g as unknown as Record<string, unknown>);
      // Boxes-only detector (Replicate) → tag the cutout now.
      if (!name) {
        const a = await analyzeCutout(url);
        name = a.name?.trim() || "";
        color = a.color ?? color;
        colorName = a.colorName ?? colorName;
        seasons = a.seasons ?? seasons;
        tags = a.tags ?? tags;
        // Detector values win where it had them; the crop fills the rest.
        attrs = mergeAttrs(attrs, readAnalyzedAttrs(a as unknown as Record<string, unknown>));
      }
      out.push({
        ...attrs,
        category: g.category,
        name,
        color: color || "#a8a29e",
        colorName,
        seasons,
        tags,
        url,
        cutoutEngine,
      });
      // Yield to the event loop so the UI can paint between CPU-heavy cutouts.
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, maxWorkers) }, () => worker()));
  return out;
}
