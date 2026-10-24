/**
 * AJA-305 — turn a spin clip's frames into angles.
 *
 * The model doesn't turn evenly: the test clip eased out of the front, lingered ~1s on the
 * back, then hurried round. Mapping a drag to TIME would make the same swipe turn a
 * different amount depending on where you are. Consecutive-frame difference tracks turning
 * speed, so the cumulative difference, scaled to 360°, is a good angle for each frame.
 */

/** A held frame still advances by this share of the mean step, so angles strictly increase. */
const FLOOR_SHARE = 0.05;

/**
 * `diffs[i]` is how different frame i is from frame i-1 (`diffs[0]` is ignored).
 * Returns one angle per frame: 0 for the first, 360 for the last.
 */
export function turnAngles(diffs: number[]): number[] {
  if (diffs.length === 0) return [];
  if (diffs.length === 1) return [0];
  const steps = diffs.slice(1).map((d) => (Number.isFinite(d) && d > 0 ? d : 0));
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  // All-identical frames (mean 0) degrade to an even spread rather than dividing by zero.
  const floor = mean > 0 ? mean * FLOOR_SHARE : 1;
  const sized = steps.map((d) => Math.max(floor, d));
  const total = sized.reduce((a, b) => a + b, 0);
  const out = [0];
  let acc = 0;
  for (const d of sized) {
    acc += d;
    out.push((acc / total) * 360);
  }
  return out;
}

/** Index of the frame nearest `deg` (any angle; wrapped into 0-360). */
export function frameForAngle(angles: number[], deg: number): number {
  if (angles.length === 0) return 0;
  const d = ((deg % 360) + 360) % 360;
  let lo = 0;
  let hi = angles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (angles[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && d - angles[lo - 1] < angles[lo] - d) return lo - 1;
  return lo;
}
