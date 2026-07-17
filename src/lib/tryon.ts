/**
 * On-body try-on (AJA-158, Phase 3) — client seam.
 *
 * Calls the existing /api/tryon (Gemini "Nano Banana"): given the outfit's
 * garment images and an optional person photo, it renders the look on that
 * person (identity preserved) or on a generic model. This function is the swap
 * point — a FASHN VTON provider can replace the fetch here without touching the
 * UI, once a FASHN key is available.
 */
import { authHeaders } from "@/lib/supabase/client";

export interface TryOnGarment {
  image: string;
  label?: string;
}

export async function tryOnOutfit(
  garments: TryOnGarment[],
  personImage: string | null,
): Promise<string> {
  const res = await fetch("/api/tryon", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ personImage, garments }),
  });
  const data = (await res.json().catch(() => ({}))) as { image?: string; error?: string };
  if (!res.ok || !data.image) {
    throw new Error(data.error || `Try-on failed (${res.status}).`);
  }
  return data.image;
}
