/**
 * The attributes `/api/analyze` can fill beyond the basics (name / category / colour /
 * seasons / tags), and the one parser that reads them.
 *
 * Every add path used to re-list these by hand, and the multi-photo importer listed
 * only five of the thirteen keys the endpoint returns — so brand was extracted from the
 * garment's label on every scan and then discarded three hand-offs later (AJA-246).
 * Deriving the type from `WardrobeItem` means the list can't drift from the fields it
 * lands in, and one parser means a path can't silently keep a different subset.
 */
import { FIT_ALIASES, type Fit, type WardrobeItem } from "./types";

export type AnalyzedAttrs = Pick<
  WardrobeItem,
  "subcategory" | "brand" | "fit" | "formality" | "material" | "pattern" | "tone" | "styleCaption"
>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Any fit word the model offers → canonical `FIT_VALUES`, or nothing. */
export function normalizeFit(v: unknown): Fit | undefined {
  const s = str(v)?.toLowerCase();
  return s ? FIT_ALIASES[s] : undefined;
}

/** Pull the attribute set out of an `/api/analyze` (or detector) response. */
export function readAnalyzedAttrs(d: Record<string, unknown> | null | undefined): AnalyzedAttrs {
  const o = d ?? {};
  return {
    subcategory: str(o.subcategory),
    brand: str(o.brand),
    fit: normalizeFit(o.fit),
    formality: str(o.formality)?.toLowerCase(),
    material: str(o.material)?.toLowerCase(),
    pattern: str(o.pattern)?.toLowerCase(),
    tone: str(o.tone)?.toLowerCase(),
    styleCaption: str(o.styleCaption),
  };
}

/**
 * Fill only the gaps: `next` wins where `prev` has nothing. Used when a detector supplies
 * some attributes and a per-cutout pass supplies the rest — a tight crop reads a label far
 * better than a whole-photo pass, but it must not overwrite what the detector was sure of.
 */
export function mergeAttrs(prev: AnalyzedAttrs, next: AnalyzedAttrs): AnalyzedAttrs {
  const out: AnalyzedAttrs = { ...prev };
  for (const k of Object.keys(next) as (keyof AnalyzedAttrs)[]) {
    if (out[k] === undefined && next[k] !== undefined) {
      // Each key is independently typed; the loop erases that, hence the assertion.
      (out as Record<string, unknown>)[k] = next[k];
    }
  }
  return out;
}
