/**
 * AJA-278 — turn a detected head box into a square face crop for the try-on
 * `faceImage` slot.
 *
 * WHY THIS EXISTS. The measured limiter on likeness is facial pixel DENSITY, not the
 * model: a full-length reference photo gives the model a face occupying ~0.85% of the
 * frame, against documented guidance of 30-50%. Cropping the head to a square raised
 * that to ~31% with **no new pixels** and visibly improved the likeness in a
 * one-variable-at-a-time test (AJA-274). This is that crop.
 *
 * `faceCropBox` is deliberately pure and separate from the detection call so the
 * geometry — which is where the off-by-a-bit bugs live — can be tested exhaustively
 * without spending a Gemini request.
 *
 * THE GOVERNING RULE: return null on any doubt. A mis-crop handed to the model
 * labelled "this is the authority on their identity" is far worse than no crop at
 * all — it would make the render worse than today's behaviour, not better.
 */

import type { NormBox } from "./gemini-box";

export type { NormBox };

/** A pixel-space square crop, ready for `sharp().extract()`. */
export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Padding around the detected head box, as a fraction of its longest side.
 *
 * The detector returns the face, but the prompt asks the model to preserve hairline,
 * hair style and jawline — so the crop has to include hair and chin, which sit
 * outside a tight face box. 0.45 was chosen to include them without diluting the
 * face back down toward the original density.
 */
const PAD = 0.45;

/**
 * Smallest useful crop. Below this the crop carries less real detail than the model
 * can already read from the full photo, so it adds a competing reference for nothing.
 */
const MIN_CROP_PX = 96;

/**
 * If the face already fills this much of the frame, skip the crop entirely.
 *
 * A saved selfie is already a face close-up: cropping it produces a near-duplicate of
 * the full image, and the reference guidance is explicit that extra images start
 * competing for control rather than reinforcing. One good reference beats two similar
 * ones.
 */
const ALREADY_CLOSE_UP_AREA = 0.2;

/** A head is roughly square. Anything far from that is not a head. */
const MAX_ASPECT_SKEW = 2.2;

/**
 * Convert a detected head box into a padded square crop in pixel space.
 *
 * Returns null when a crop shouldn't be attempted at all — see the rule in the module
 * comment. Callers must treat null as "send the full photo only", never as an error.
 */
export function faceCropBox(
  box: NormBox,
  imgW: number,
  imgH: number,
  opts: { pad?: number; minPx?: number } = {},
): CropRect | null {
  const pad = opts.pad ?? PAD;
  const minPx = opts.minPx ?? MIN_CROP_PX;

  if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW < 1 || imgH < 1) return null;
  for (const v of [box.x, box.y, box.w, box.h]) {
    if (!Number.isFinite(v)) return null;
  }
  if (box.w <= 0 || box.h <= 0) return null;
  // Outside the frame, or extending past it — the detector has lost the plot.
  if (box.x < 0 || box.y < 0 || box.x + box.w > 1.0001 || box.y + box.h > 1.0001) return null;

  // Already a close-up: a second, nearly identical reference is a competing signal.
  if (box.w * box.h >= ALREADY_CLOSE_UP_AREA) return null;

  const boxPxW = box.w * imgW;
  const boxPxH = box.h * imgH;
  // Not head-shaped. Most likely a torso, a limb, or two faces merged into one box.
  const skew = Math.max(boxPxW / boxPxH, boxPxH / boxPxW);
  if (!Number.isFinite(skew) || skew > MAX_ASPECT_SKEW) return null;

  // Square, centred on the box, grown by `pad` so hair and chin come along.
  const size = Math.round(Math.max(boxPxW, boxPxH) * (1 + pad * 2));
  if (size < minPx) return null;
  // A crop bigger than the source is just the source; nothing gained.
  if (size >= Math.min(imgW, imgH) && size >= Math.max(boxPxW, boxPxH) * 3) return null;

  const cx = (box.x + box.w / 2) * imgW;
  const cy = (box.y + box.h / 2) * imgH;
  // Clamp so the square stays inside the image. Shifting beats shrinking: a head near
  // the top edge (the normal case for a full-length shot) should slide down into frame
  // rather than lose its hair to a smaller crop.
  const side = Math.min(size, Math.floor(imgW), Math.floor(imgH));
  const left = Math.round(Math.max(0, Math.min(cx - side / 2, imgW - side)));
  const top = Math.round(Math.max(0, Math.min(cy - side / 2, imgH - side)));

  if (side < minPx) return null;
  return { left, top, width: side, height: side };
}

/**
 * Pick the subject's head out of everything detected, or nothing.
 *
 * With two comparably sized heads there is no safe way to tell the wearer from a
 * bystander, and cropping the wrong one hands the model a stranger's face as the
 * identity authority — strictly worse than not cropping. So: exactly one head, or one
 * clearly dominant head (2x the next by area), or null.
 *
 * Lives here rather than beside the fetch so this rule is testable without `sharp` or
 * a network call.
 */
export function subjectHead(boxes: NormBox[]): NormBox | null {
  if (boxes.length === 0) return null;
  if (boxes.length === 1) return boxes[0];
  const byArea = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h);
  const [first, second] = byArea;
  return first.w * first.h >= second.w * second.h * 2 ? first : null;
}

/**
 * Face area as a fraction of the frame it sits in.
 *
 * This is the metric the whole approach rests on, so it is computed rather than
 * assumed: if it doesn't move, the pixel-density hypothesis is wrong and the next
 * suspect is prompt weighting. Expect roughly 0.009 before the crop and 0.2-0.4 after.
 */
export function faceAreaFraction(box: NormBox, crop: CropRect | null, imgW: number, imgH: number): number {
  const facePx = box.w * imgW * box.h * imgH;
  const framePx = crop ? crop.width * crop.height : imgW * imgH;
  if (framePx <= 0) return 0;
  return facePx / framePx;
}
