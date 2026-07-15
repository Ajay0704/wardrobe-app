/**
 * Garment background-removal (AJA-116/cutout). The ONE place cutouts happen, behind a
 * swappable engine seam so a higher-quality engine (remove.bg / PhotoRoom API, SAM-3 via
 * Replicate, Apple Vision on-device) can be dropped in later without touching callers.
 *
 * Default engine = on-device @imgly (WASM, free, no keys), hardened: runs off the main
 * thread (proxyToWorker), uses the fp16 model (quality/size balance), outputs a transparent
 * PNG, and reports progress. Every cutout is stamped with the engine + version that made it.
 */
import { resolveImageSource } from "./supabase/storage";

const IMGLY_VERSION = "1.7.0";

export interface CutoutResult {
  /** Re-hosted image source (Storage URL when signed in, else a data URL). */
  url: string;
  /** Stamp of the engine that produced it, e.g. "imgly@1.7.0". */
  engine: string;
}

/** REMOVAL_ENGINE seam: one method that turns an image into a background-removed PNG. */
export interface CutoutEngine {
  id: string;
  run(input: Blob | string, onProgress?: (fraction: number) => void): Promise<Blob>;
}

const imglyEngine: CutoutEngine = {
  id: `imgly@${IMGLY_VERSION}`,
  async run(input, onProgress) {
    const { removeBackground } = await import("@imgly/background-removal");
    // Optional self-hosting of the model/wasm assets for native/offline reliability.
    const publicPath = process.env.NEXT_PUBLIC_IMGLY_PUBLIC_PATH || undefined;
    return removeBackground(input, {
      proxyToWorker: true,
      model: "isnet_fp16",
      output: { format: "image/png" },
      ...(publicPath ? { publicPath } : {}),
      ...(onProgress
        ? { progress: (_key: string, current: number, total: number) => onProgress(total ? current / total : 0) }
        : {}),
    });
  },
};

/** Resolve the active cutout engine (REMOVAL_ENGINE flag; on-device @imgly is the default). */
export function getCutoutEngine(): CutoutEngine {
  const which = (process.env.NEXT_PUBLIC_REMOVAL_ENGINE || "imgly").toLowerCase();
  switch (which) {
    // case "api":         return apiEngine;         // remove.bg / PhotoRoom (server route) — future
    // case "sam":         return samEngine;         // SAM-3 via Replicate — future
    // case "applevision": return appleVisionEngine; // native Capacitor plugin — future
    case "imgly":
    default:
      return imglyEngine;
  }
}

/** Fetch a remote URL into a Blob so the WASM pipeline handles CORS/data URLs uniformly. */
async function toEngineInput(src: string): Promise<Blob | string> {
  if (src.startsWith("http")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error("fetch-failed");
    return res.blob();
  }
  return src;
}

/**
 * Remove the background from an image source and re-host the transparent PNG. Returns the new
 * URL plus the engine stamp. Throws on failure — callers keep the original image.
 */
export async function cutout(
  src: string,
  userId: string | null,
  onProgress?: (fraction: number) => void,
): Promise<CutoutResult> {
  const engine = getCutoutEngine();
  const input = await toEngineInput(src);
  const blob = await engine.run(input, onProgress);
  const file = new File([blob], "cutout.png", { type: "image/png" });
  const url = await resolveImageSource(file, userId);
  return { url, engine: engine.id };
}
