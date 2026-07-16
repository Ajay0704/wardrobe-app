/**
 * Beautify (AJA-120): generative product-shot redraw, behind a swappable BEAUTIFY_ENGINE seam
 * (parallel to the cutout seam in cutout.ts). Default engine = Gemini image model via /api/beautify.
 * Unlike cutout there is NO silent fallback — Beautify is an explicit user action, so failures
 * throw and the caller decides (a 501 disables the button; other errors just toast).
 */
import { resolveImageSource } from "./supabase/storage";
import { authHeaders } from "./supabase/client";
import { cutout } from "./cutout";

/**
 * Beautify pipeline version. Bump when the prompt, normalization or removal changes so the editor
 * can offer a one-time regenerate for images made by an older pipeline. It's appended to the model
 * stamp; a cached beautify whose stamp lacks the current marker is treated as stale.
 */
export const BEAUTIFY_PIPELINE = "pipe3";

/** Fixed square output edge — MUST match CANVAS in /api/beautify's normalization. */
const CANVAS = 1000;

export interface BeautifyResult {
  /** Re-hosted product-shot (Storage URL when signed in, else a data URL). */
  url: string;
  /** Model + pipeline stamp, e.g. "gemini@2.5-flash-image+imgly@1.7.0+pipe3". */
  model: string;
}

export interface BeautifyEngine {
  id: string;
  run(src: string): Promise<Blob>;
}

const geminiEngine: BeautifyEngine = {
  id: "gemini@2.5-flash-image",
  async run(src) {
    const isHttp = src.startsWith("http");
    const res = await fetch("/api/beautify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(isHttp ? { imageUrl: src } : { imageData: src }),
    });
    if (!res.ok) throw new Error(`beautify ${res.status}`); // 501 propagates → caller disables
    return res.blob();
  },
};

/** Resolve the active beautify engine (BEAUTIFY_ENGINE flag; Gemini is the default). */
export function getBeautifyEngine(): BeautifyEngine {
  const which = (process.env.NEXT_PUBLIC_BEAUTIFY_ENGINE || "gemini").toLowerCase();
  switch (which) {
    // case "fashn": return fashnEngine; // future
    case "gemini":
    default:
      return geminiEngine;
  }
}

/** Read a Blob into a data: URL so the redraw can be fed back through the cutout pipeline. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read-failed"));
    reader.readAsDataURL(blob);
  });
}

/** Load an image URL (dimensions are readable without CORS). */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image-load-failed"));
    img.src = src;
  });
}

/**
 * Client-side guard for the fixed 1000×1000 canvas. The server pins that geometry, but background
 * removal could (with a future engine) change the image dimensions. Returns null when the image is
 * already CANVAS×CANVAS (the common case — a cheap decode, no re-processing); otherwise redraws it
 * centred and aspect-fit on a fresh transparent CANVAS×CANVAS canvas and returns the corrected PNG.
 */
async function enforceSquareCanvas(url: string): Promise<Blob | null> {
  if (typeof document === "undefined") return null; // SSR safety
  const probe = await loadImage(url);
  if (probe.naturalWidth === CANVAS && probe.naturalHeight === CANVAS) return null;
  // Corrective path: re-fetch as a blob URL (same-origin → untainted canvas readback), then redraw.
  const objUrl = URL.createObjectURL(await (await fetch(url)).blob());
  try {
    const img = await loadImage(objUrl);
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS;
    canvas.height = CANVAS;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const scale = Math.min(CANVAS / img.naturalWidth, CANVAS / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (CANVAS - w) / 2, (CANVAS - h) / 2, w, h);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

/**
 * Redraw a garment cutout into a product shot, then remove the white background so the result is a
 * transparent garment (only the shirt) — the outfit canvas needs the piece floating, not a white box.
 * Removal is reliable here because the redraw is centred and front-facing. Returns the new URL +
 * model stamp. Throws on failure (caller inspects `beautify 501` to disable the button); if only the
 * background removal fails, we keep the white-bg redraw so Beautify still yields something.
 */
export async function beautify(
  src: string,
  userId: string | null,
  category?: string,
): Promise<BeautifyResult> {
  const engine = getBeautifyEngine();
  const blob = await engine.run(src); // white-bg product shot (501/other errors propagate)
  try {
    const dataUrl = await blobToDataUrl(blob);
    const { url, engine: removalId } = await cutout(dataUrl, userId, { category });
    // Guard: ensure the final image is exactly the fixed canvas even if removal changed dimensions.
    // No-op in the common case; best-effort (keep the removal result if the guard itself fails).
    let finalUrl = url;
    try {
      const fixed = await enforceSquareCanvas(url);
      if (fixed) {
        finalUrl = await resolveImageSource(
          new File([fixed], "beautified.png", { type: "image/png" }),
          userId,
        );
      }
    } catch {
      /* guard is best-effort — fall back to the removal result */
    }
    // Stamp model + removal engine + pipeline version. The pipeline marker lets the editor spot a
    // stale cache (older/white-bg/unnormalized) and offer a one-time regenerate.
    return { url: finalUrl, model: `${engine.id}+${removalId}+${BEAUTIFY_PIPELINE}` };
  } catch {
    // Background removal failed — fall back to re-hosting the redraw as-is (stays white-bg).
    const file = new File([blob], "beautified.png", { type: "image/png" });
    const url = await resolveImageSource(file, userId);
    return { url, model: engine.id };
  }
}
