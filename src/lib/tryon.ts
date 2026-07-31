/**
 * On-body try-on (AJA-158 Phase 3, accuracy pass AJA-274) — client seam.
 *
 * Calls /api/tryon, which renders the look on the user's own photo (identity
 * preserved) or on a generic model. This function is the swap point: a dedicated
 * VTON provider could replace the fetch without touching the UI.
 *
 * AJA-274 measured why that swap is NOT wanted: a real inpainting VTON
 * (idm-vton) preserves the body perfectly but mangles garment text — it rendered
 * "Snapdragon" as "Sappcaigan" — while Gemini reproduces wordmarks, crests and
 * prints faithfully. For a closet built on sponsored kit, logo fidelity wins.
 */
import { authHeaders } from "@/lib/supabase/client";
import type { WardrobeItem } from "@/lib/types";

export interface TryOnGarment {
  image: string;
  label?: string;
}

/** Where the render is set. Ids only — the prompt text lives server-side. */
export type TryOnScene = "street" | "window" | "park" | "studio";

/** Labels kept short: the full names ("City street", "By a window", "Plain studio")
 *  measured 370px against a 343px row at 375px wide, clipping the last chip. */
export const TRYON_SCENES: { id: TryOnScene; label: string }[] = [
  { id: "street", label: "Street" },
  { id: "window", label: "Window" },
  { id: "park", label: "Outdoors" },
  { id: "studio", label: "Studio" },
];

/**
 * Which stored image to send for a garment.
 *
 * `beautifiedImageUrl` is a Gemini ghost-mannequin redraw, so this looks like it
 * should prefer the "real" pixels in `cutoutImageUrl`. AJA-274 checked, and it is
 * the other way round: the raw cutout is the photo as taken — for one jersey, the
 * shirt crumpled sideways on a bed with the sheets still in frame. The redraw is a
 * clean front-on product shot that carries the wordmark, crest and pattern over
 * faithfully, and it is by far the better try-on reference.
 */
export function garmentImage(it: WardrobeItem): string | undefined {
  return it.beautifiedImageUrl ?? it.imageUrl ?? undefined;
}

/**
 * The words sent alongside a garment photo. Deliberately garment TYPE ONLY.
 *
 * This used to be `[colorName, category]` — "dark yellow tshirt". AJA-274 found
 * that label overriding the photograph: the tee is olive, `colorName` is mis-tagged
 * as "dark yellow", and 3 of 4 test renders produced a mustard shirt. Every extra
 * attribute in this string is another mis-tagged field that can outvote the image,
 * so colour, pattern, material and the free-text name are all excluded. The route
 * pairs this with a rule telling the model the photo wins any disagreement.
 */
export function garmentLabel(it: WardrobeItem): string {
  return it.subcategory || it.category;
}

/** Build the try-on payload for a set of items, skipping any without an image. */
export function toGarments(items: WardrobeItem[]): TryOnGarment[] {
  const out: TryOnGarment[] = [];
  for (const it of items) {
    const image = garmentImage(it);
    if (!image) continue;
    out.push({ image, label: garmentLabel(it) });
  }
  return out;
}

export interface TryOnRequest {
  garments: TryOnGarment[];
  /** Full-body photo of the user. null renders a generic model. */
  personImage: string | null;
  /** Optional face close-up. Carries far more identity signal than a full-body
   *  shot, where the face can be well under 1% of the frame. */
  faceImage?: string | null;
  scene?: TryOnScene;
}

export async function tryOnOutfit(req: TryOnRequest): Promise<string> {
  const res = await fetch("/api/tryon", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(req),
  });
  const data = (await res.json().catch(() => ({}))) as { image?: string; error?: string };
  if (!res.ok || !data.image) {
    // 501 = provider not configured. Mirrors /api/beautify and /api/cutout so the
    // UI can permanently disable the affordance rather than offering a retry that
    // can never succeed (see beautify.ts's "beautify 501" sentinel).
    throw new Error(data.error || `Try-on failed (${res.status}).`);
  }
  return data.image;
}
