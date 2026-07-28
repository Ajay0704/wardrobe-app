/**
 * Backfilling attributes onto closet items that predate auto-fill (AJA-247).
 *
 * Pure decisions only — which image to read, what's missing, what may be written — so the
 * rules can be tested without a model call. The queue that drives it lives in
 * `import-queue.ts`.
 *
 * The load-bearing detail is WHICH image. 197 of 217 items in the measured closet are
 * beautified, so `imageUrl` is a generatively rendered ghost-mannequin rather than the
 * user's photo. Structure (fit, material, pattern, formality) survives that render, but a
 * small wordmark does not: beautify can smooth it away or redraw it. Reading a brand off a
 * generated image means storing the image model's invention as fact, and a plausible-looking
 * wrong brand shows on the card and in closet search where it's easy to miss.
 */
import type { AnalyzedAttrs } from "./analyze-attrs";
import type { WardrobeItem } from "./types";

/** Attributes a backfill may write, in the order they're reported. */
export const BACKFILL_KEYS = [
  "subcategory", "brand", "fit", "formality", "material", "pattern", "tone", "styleCaption",
] as const satisfies readonly (keyof AnalyzedAttrs)[];

export interface AnalyzeSource {
  /** The image to send. */
  url: string;
  /** False when the only image left is a beautify render, so `brand` must not be trusted. */
  trustBrand: boolean;
}

/**
 * The most truthful image available for an item, preferring real photography over anything
 * generated: the pre-cutout original, then the pre-beautify cutout, then whatever is on the
 * card. Null when there's nothing to read.
 */
export function bestAnalyzeSource(item: WardrobeItem): AnalyzeSource | null {
  if (item.originalImageUrl) return { url: item.originalImageUrl, trustBrand: true };
  if (item.cutoutImageUrl) return { url: item.cutoutImageUrl, trustBrand: true };
  if (!item.imageUrl) return null;
  // `imageUrl` is the beautified render when beautify ran and left no earlier copy.
  const generated =
    !!item.beautifiedImageUrl && item.imageUrl === item.beautifiedImageUrl;
  return { url: item.imageUrl, trustBrand: !generated };
}

/** Which backfillable attributes this item is currently missing. */
export function missingAttrKeys(item: WardrobeItem): (keyof AnalyzedAttrs)[] {
  return BACKFILL_KEYS.filter((k) => {
    const v = item[k];
    return typeof v !== "string" || !v.trim();
  });
}

/**
 * The missing attributes this item's best image could actually supply.
 *
 * Distinct from `missingAttrKeys` on purpose: an item whose only image is a beautify render
 * can never get a brand, so counting that gap would leave it queued forever — the row would
 * sit on "1 item" and every run would spend a call that provably writes nothing.
 */
export function fillableAttrKeys(item: WardrobeItem): (keyof AnalyzedAttrs)[] {
  const source = bestAnalyzeSource(item);
  if (!source) return [];
  const missing = missingAttrKeys(item);
  return source.trustBrand ? missing : missing.filter((k) => k !== "brand");
}

/** Would a pass do anything for this item? */
export function needsBackfill(item: WardrobeItem): boolean {
  if (item.wishlist) return false; // the wishlist has its own add-time fill (AJA-243)
  return fillableAttrKeys(item).length > 0;
}

/** How many items a run would touch — shown on the button so it never overstates itself. */
export function countNeedingBackfill(items: WardrobeItem[]): number {
  return items.filter(needsBackfill).length;
}

/**
 * The patch to apply: only keys the item is missing, and never `brand` from a generated
 * image. Returns an empty object when there's nothing to write, so callers can skip the
 * store update entirely.
 */
export function backfillPatch(
  item: WardrobeItem,
  attrs: AnalyzedAttrs,
  trustBrand: boolean,
): Partial<WardrobeItem> {
  const patch: Partial<WardrobeItem> = {};
  for (const k of missingAttrKeys(item)) {
    if (k === "brand" && !trustBrand) continue;
    const v = attrs[k];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) continue;
    // Each key is independently typed; the loop erases that, hence the assertion.
    (patch as Record<string, unknown>)[k] = v;
  }
  return patch;
}
