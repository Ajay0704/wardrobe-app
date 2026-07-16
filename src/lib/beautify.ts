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
export const BEAUTIFY_PIPELINE = "pipe2";

export interface BeautifyResult {
  /** Re-hosted product-shot (Storage URL when signed in, else a data URL). */
  url: string;
  /** Model + pipeline stamp, e.g. "gemini@2.5-flash-image+imgly@1.7.0+pipe2". */
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
    // Stamp model + removal engine + pipeline version. The pipeline marker lets the editor spot a
    // stale cache (older/white-bg/unnormalized) and offer a one-time regenerate.
    return { url, model: `${engine.id}+${removalId}+${BEAUTIFY_PIPELINE}` };
  } catch {
    // Background removal failed — fall back to re-hosting the redraw as-is (stays white-bg).
    const file = new File([blob], "beautified.png", { type: "image/png" });
    const url = await resolveImageSource(file, userId);
    return { url, model: engine.id };
  }
}
