/**
 * Beautify (AJA-120): generative product-shot redraw, behind a swappable BEAUTIFY_ENGINE seam
 * (parallel to the cutout seam in cutout.ts). Default engine = Gemini image model via /api/beautify.
 * Unlike cutout there is NO silent fallback — Beautify is an explicit user action, so failures
 * throw and the caller decides (a 501 disables the button; other errors just toast).
 */
import { resolveImageSource } from "./supabase/storage";
import { authHeaders } from "./supabase/client";

export interface BeautifyResult {
  /** Re-hosted product-shot (Storage URL when signed in, else a data URL). */
  url: string;
  /** Stamp of the model that produced it, e.g. "gemini@2.5-flash-image". */
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

/**
 * Redraw a garment cutout into a product shot and re-host it. Returns the new URL + model stamp.
 * Throws on failure (caller inspects `beautify 501` to disable the button).
 */
export async function beautify(src: string, userId: string | null): Promise<BeautifyResult> {
  const engine = getBeautifyEngine();
  const blob = await engine.run(src);
  const file = new File([blob], "beautified.png", { type: "image/png" });
  const url = await resolveImageSource(file, userId);
  return { url, model: engine.id };
}
