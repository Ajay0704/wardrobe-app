/**
 * Fit (AJA-161, Phase 3) — size profile + "your size" hints.
 *
 * The no-API layer: the user records their usual sizes and we surface "your
 * size: M" on shop items in the matching category. The richer true-to-fit
 * confidence / keep-rate (needs a body profile + brand size data) plugs in
 * later behind the fitProvider seam in src/lib/explore/foundation.ts.
 */
import type { UserProfile } from "@/lib/profile";

export type SizeSlot = "top" | "bottom" | "dress" | "shoes";

export const SIZE_SLOTS: { slot: SizeSlot; label: string; placeholder: string }[] = [
  { slot: "top", label: "Tops", placeholder: "M" },
  { slot: "bottom", label: "Bottoms", placeholder: "32" },
  { slot: "dress", label: "Dresses", placeholder: "8" },
  { slot: "shoes", label: "Shoes", placeholder: "10" },
];

/** Map a product/garment category to the size slot it draws from. */
export function sizeSlotForCategory(category: string): SizeSlot | null {
  const c = category.toLowerCase();
  if (/(dress|gown|jumpsuit|romper)/.test(c)) return "dress";
  if (/(shoe|sneaker|boot|heel|sandal|loafer|trainer|footwear)/.test(c)) return "shoes";
  if (/(pant|jean|trouser|short|skirt|legging|chino|bottom|slacks)/.test(c)) return "bottom";
  if (/(shirt|tee|top|blouse|sweater|hoodie|cardigan|jacket|blazer|coat|outerwear|tank|polo|knit)/.test(c))
    return "top";
  return null;
}

/** The user's saved size for a product category, or null if unset. */
export function yourSize(profile: UserProfile, category: string): string | null {
  const slot = sizeSlotForCategory(category);
  if (!slot) return null;
  const s = profile.sizes?.[slot]?.trim();
  return s ? s : null;
}

/** True once the user has recorded at least one size. */
export function hasAnySize(profile: UserProfile): boolean {
  const s = profile.sizes;
  return Boolean(s && (s.top || s.bottom || s.dress || s.shoes));
}
