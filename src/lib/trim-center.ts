/**
 * Trim-and-center (AJA-225). A deterministic, on-device reframing step for cutout "stickers":
 * crop a transparent PNG to its garment's alpha bounding box and re-center it on a fixed
 * CANVAS×CANVAS transparent square (longest side ≈ FILL), so every item — tops, bottoms, shoes,
 * accessories — shares the exact scale + framing the beautify refine route produces server-side.
 * That's what makes the edit hero and the outfit canvas read as a tidy, centered collage instead
 * of pieces floating off to one corner.
 *
 * No AI, no network: it only moves/scales existing pixels and preserves the source alpha, so a
 * transparent cutout STAYS transparent (never flattened to an opaque/JPEG background). Best-effort —
 * returns the input blob unchanged on SSR, a tainted canvas, or a fully-transparent image.
 */

const CANVAS = 1000; // fixed square edge — matches /api/beautify + /api/beautify/refine + beautify.ts
const FILL = 900; // garment's longest side ≈ 90% of the canvas (matches refine's FILL)
const ALPHA_THRESHOLD = 10; // alpha above this counts as garment (matches refine's bbox test)
const MAX_SCAN = 1200; // cap the pixel-scan resolution so the bbox pass stays cheap on big photos

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image-load-failed"));
    img.src = src;
  });
}

/**
 * Crop `blob` to its opaque bounding box and center it on a transparent CANVAS² square.
 * Returns a fresh PNG Blob, or the original blob unchanged if reframing isn't possible.
 */
export async function trimAndCenter(blob: Blob): Promise<Blob> {
  if (typeof document === "undefined") return blob; // SSR safety
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    if (!img.naturalWidth || !img.naturalHeight) return blob;

    // Draw onto a scratch canvas capped at MAX_SCAN so the per-pixel alpha scan stays bounded even
    // for a large source photo; the bbox is then in scratch coordinates.
    const s = Math.min(1, MAX_SCAN / Math.max(img.naturalWidth, img.naturalHeight));
    const sw = Math.max(1, Math.round(img.naturalWidth * s));
    const sh = Math.max(1, Math.round(img.naturalHeight * s));
    const scratch = document.createElement("canvas");
    scratch.width = sw;
    scratch.height = sh;
    const sctx = scratch.getContext("2d");
    if (!sctx) return blob;
    sctx.drawImage(img, 0, 0, sw, sh);

    let data: Uint8ClampedArray;
    try {
      data = sctx.getImageData(0, 0, sw, sh).data;
    } catch {
      return blob; // tainted canvas — bail rather than corrupt the image
    }

    // Alpha bounding box of the visible content.
    let minX = sw;
    let minY = sh;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < sh; y++) {
      const row = y * sw;
      for (let x = 0; x < sw; x++) {
        if (data[(row + x) * 4 + 3] > ALPHA_THRESHOLD) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return blob; // fully transparent — nothing to reframe

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const scale = FILL / Math.max(bw, bh);
    const dw = Math.max(1, Math.round(bw * scale));
    const dh = Math.max(1, Math.round(bh * scale));

    const out = document.createElement("canvas");
    out.width = CANVAS;
    out.height = CANVAS;
    const octx = out.getContext("2d");
    if (!octx) return blob;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(
      scratch,
      minX,
      minY,
      bw,
      bh, // source = content bbox
      Math.round((CANVAS - dw) / 2),
      Math.round((CANVAS - dh) / 2),
      dw,
      dh, // dest = centered on the square
    );

    const outBlob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), "image/png"),
    );
    return outBlob ?? blob;
  } catch {
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
