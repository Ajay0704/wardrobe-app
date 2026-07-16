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
export const BEAUTIFY_PIPELINE = "pipe4";

/** Fixed square output edge — MUST match CANVAS in /api/beautify's normalization. */
const CANVAS = 1000;

export interface BeautifyResult {
  /** Transparent "sticker" (garment on transparency) — the image used on the outfit canvas. */
  url: string;
  /** Garment-on-white ghost-mannequin product shot — kept for the item detail screen. */
  whiteUrl: string;
  /** Model + pipeline stamp, e.g. "gemini@2.5-flash-image+imgly@1.7.0+sticker+pipe4". */
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

/** Refine the outer cutout into a clean transparent sticker: clear interior openings, feather, and
 *  normalize to the fixed transparent canvas. Returns the re-hosted sticker URL, or null on failure. */
async function refineSticker(
  whiteData: string,
  cutUrl: string,
  userId: string | null,
): Promise<string | null> {
  const res = await fetch("/api/beautify/refine", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      whiteData,
      ...(cutUrl.startsWith("http") ? { cutUrl } : { cutData: cutUrl }),
    }),
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return resolveImageSource(new File([blob], "sticker.png", { type: "image/png" }), userId);
}

/**
 * Beautify → transparent canvas sticker. Redraw the garment as a ghost-mannequin on white, then:
 *  (1) remove the outer background via the existing cutout (soft edges), (2) clear enclosed
 *  near-pure-white openings (neck/cuff/arm gaps) while preserving white/pale logos and panels, and
 *  (3) trim + centre on a fixed transparent square. Returns the transparent sticker (for the canvas)
 *  and the garment-on-white product shot (for the item detail screen). Throws on failure (the caller
 *  inspects `beautify 501` to disable the button); if only removal fails we keep the white redraw.
 */
export async function beautify(
  src: string,
  userId: string | null,
  category?: string,
): Promise<BeautifyResult> {
  const engine = getBeautifyEngine();
  const blob = await engine.run(src); // ghost-mannequin on white (501/other errors propagate)
  const whiteUrl = await resolveImageSource(
    new File([blob], "beautified.png", { type: "image/png" }),
    userId,
  );
  try {
    const whiteData = await blobToDataUrl(blob);
    const { url: cutUrl, engine: removalId } = await cutout(whiteData, userId, { category });
    // Refine the cutout into a clean transparent sticker (interior openings cleared, feathered,
    // normalized). Best-effort: fall back to the plain cutout if refine is unavailable.
    let stickerUrl = cutUrl;
    try {
      const refined = await refineSticker(whiteData, cutUrl, userId);
      if (refined) stickerUrl = refined;
    } catch {
      /* keep the plain cutout */
    }
    // Backstop the fixed canvas even if a removal engine changed dimensions (no-op after refine).
    try {
      const fixed = await enforceSquareCanvas(stickerUrl);
      if (fixed) {
        stickerUrl = await resolveImageSource(
          new File([fixed], "sticker.png", { type: "image/png" }),
          userId,
        );
      }
    } catch {
      /* guard is best-effort */
    }
    return { url: stickerUrl, whiteUrl, model: `${engine.id}+${removalId}+sticker+${BEAUTIFY_PIPELINE}` };
  } catch {
    // Background removal failed — keep the white redraw for both (still better than nothing).
    return { url: whiteUrl, whiteUrl, model: engine.id };
  }
}
