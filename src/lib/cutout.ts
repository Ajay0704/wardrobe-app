/**
 * Garment cutout (AJA-116/117/118). The ONE place cutouts happen, behind a swappable
 * REMOVAL_ENGINE seam:
 *   - "imgly" (default) — on-device @imgly WASM background removal (subject vs background).
 *   - "garment"         — clothes-aware SegFormer via /api/cutout: extracts JUST the garment
 *                         for the item's category (top/bottom/dress/…), not the whole person.
 * A non-imgly engine that fails (missing key, provider error, empty mask) falls back to imgly,
 * so a cutout never hard-fails. Every result is stamped with the engine that produced it.
 */
import { resolveImageSource } from "./supabase/storage";
import { authHeaders } from "./supabase/client";

const IMGLY_VERSION = "1.7.0";

export interface CutoutResult {
  /** Re-hosted image source (Storage URL when signed in, else a data URL). */
  url: string;
  /** Stamp of the engine that produced it, e.g. "imgly@1.7.0" or "garment@segformer_b2_clothes". */
  engine: string;
}

export interface CutoutOptions {
  onProgress?: (fraction: number) => void;
  /** Wardrobe category — lets the garment engine pick the right clothing class. */
  category?: string;
}

/** REMOVAL_ENGINE seam: turn an image source (http URL or data URL) into a cutout PNG blob. */
export interface CutoutEngine {
  id: string;
  run(src: string, opts?: CutoutOptions): Promise<Blob>;
}

const imglyEngine: CutoutEngine = {
  id: `imgly@${IMGLY_VERSION}`,
  async run(src, opts) {
    const { removeBackground } = await import("@imgly/background-removal");
    // Fetch remote URLs into a blob so CORS-restricted hosts (and data URLs) go through the
    // WASM pipeline uniformly.
    let input: Blob | string = src;
    if (src.startsWith("http")) {
      const res = await fetch(src);
      if (!res.ok) throw new Error("fetch-failed");
      input = await res.blob();
    }
    const publicPath = process.env.NEXT_PUBLIC_IMGLY_PUBLIC_PATH || undefined;
    return removeBackground(input, {
      proxyToWorker: true,
      model: "isnet_fp16",
      output: { format: "image/png" },
      ...(publicPath ? { publicPath } : {}),
      ...(opts?.onProgress
        ? {
            progress: (_key: string, current: number, total: number) =>
              opts.onProgress!(total ? current / total : 0),
          }
        : {}),
    });
  },
};

const garmentEngine: CutoutEngine = {
  id: "garment@segformer_b2_clothes",
  async run(src, opts) {
    const isHttp = src.startsWith("http");
    const res = await fetch("/api/cutout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        ...(isHttp ? { imageUrl: src } : { imageData: src }),
        category: opts?.category,
      }),
    });
    if (!res.ok) throw new Error(`garment-cutout ${res.status}`);
    return res.blob();
  },
};

/** Resolve the active cutout engine (REMOVAL_ENGINE flag; on-device @imgly is the default). */
export function getCutoutEngine(): CutoutEngine {
  const which = (process.env.NEXT_PUBLIC_REMOVAL_ENGINE || "imgly").toLowerCase();
  switch (which) {
    case "garment":
      return garmentEngine;
    // case "sam":         return samEngine;         // SAM-3 via Replicate — future
    // case "applevision": return appleVisionEngine; // native Capacitor plugin — future
    case "imgly":
    default:
      return imglyEngine;
  }
}

async function finalize(
  blob: Blob,
  engineId: string,
  userId: string | null,
): Promise<CutoutResult> {
  const file = new File([blob], "cutout.png", { type: "image/png" });
  const url = await resolveImageSource(file, userId);
  return { url, engine: engineId };
}

/**
 * Cut out the garment/subject and re-host the transparent PNG. Returns the new URL + engine
 * stamp. A non-imgly engine that throws degrades to on-device @imgly; if that also throws the
 * caller keeps the original image.
 */
export async function cutout(
  src: string,
  userId: string | null,
  opts?: CutoutOptions,
): Promise<CutoutResult> {
  const engine = getCutoutEngine();
  try {
    return await finalize(await engine.run(src, opts), engine.id, userId);
  } catch (e) {
    if (engine.id !== imglyEngine.id) {
      // Graceful fallback: garment/API engine failed → on-device background removal.
      return finalize(await imglyEngine.run(src, opts), imglyEngine.id, userId);
    }
    throw e;
  }
}

/** Decode a base64 PNG (from the multi API) into a Blob for re-hosting. */
function base64ToBlob(b64: string, type = "image/png"): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

/**
 * Split one photo into a separate garment cutout per class (grouped by category), each re-hosted.
 * Only works with the garment engine; if that isn't active or the multi call fails, degrades to a
 * single cutout returned as a one-element array (never hard-fails).
 */
export async function cutoutMulti(
  src: string,
  userId: string | null,
  opts?: CutoutOptions,
): Promise<{ category: string; url: string }[]> {
  if (getCutoutEngine().id === garmentEngine.id) {
    try {
      const isHttp = src.startsWith("http");
      const res = await fetch("/api/cutout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ ...(isHttp ? { imageUrl: src } : { imageData: src }), mode: "multi" }),
      });
      if (!res.ok) throw new Error(`cutout-multi ${res.status}`);
      const data = (await res.json()) as { cutouts?: { category: string; pngBase64: string }[] };
      const out: { category: string; url: string }[] = [];
      for (const c of data.cutouts ?? []) {
        const file = new File([base64ToBlob(c.pngBase64)], "cutout.png", { type: "image/png" });
        out.push({ category: c.category, url: await resolveImageSource(file, userId) });
      }
      if (out.length) return out;
    } catch {
      /* fall through to single */
    }
  }
  // Fallback: one cutout for the whole photo.
  const single = await cutout(src, userId, opts);
  return [{ category: opts?.category ?? "top", url: single.url }];
}
