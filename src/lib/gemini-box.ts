/**
 * Gemini's bounding-box convention, in one place.
 *
 * `box_2d` comes back as `[ymin, xmin, ymax, xmax]` normalized to 0-1000 — y first,
 * and NOT the `[x, y, w, h]` most code expects. Getting that wrong produces boxes that
 * look plausible but are transposed, which is the kind of bug that survives review.
 * Extracted from `api/detect-garments` when face detection needed the same conversion
 * (AJA-278); two copies of this would eventually disagree.
 */
export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `box_2d` → `{x,y,w,h}` in 0-1. Returns null for anything malformed or degenerate. */
export function toBox(raw: unknown): NormBox | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = raw.map((n) => Number(n));
  if ([ymin, xmin, ymax, xmax].some((n) => !Number.isFinite(n))) return null;
  const x = Math.min(xmin, xmax) / 1000;
  const y = Math.min(ymin, ymax) / 1000;
  const w = Math.abs(xmax - xmin) / 1000;
  const h = Math.abs(ymax - ymin) / 1000;
  if (w <= 0.01 || h <= 0.01) return null;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    w: Math.max(0, Math.min(1, w)),
    h: Math.max(0, Math.min(1, h)),
  };
}
