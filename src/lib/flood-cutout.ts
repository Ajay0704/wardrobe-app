/**
 * Deterministic background removal via border flood-fill (AJA-225). A browser-canvas port of the
 * `outerCutout` recipe in scripts/gen-samples.mjs (that one uses Node `sharp`; the runtime cutout
 * path runs client-side, so this uses <canvas> + getImageData/putImageData instead).
 *
 * Keyed to the ACTUAL corner colour, it removes a UNIFORM outer background (white, grey or tinted
 * studio card) within a tolerance, leaving the centred product on transparency — with ZERO
 * generative drift (exact product pixels preserved). This is what makes a not-worn product photo
 * (shoes/bags on a studio card) canvas-ready, where the salient-subject matte (@imgly) leaves the
 * card behind. For worn selfies / busy backgrounds the background is not uniform, so
 * `floodFillIfUniform` bails and the caller keeps using the normal engine.
 */

const TOL = 42; // colour distance from the background reference to treat a pixel as background
const MAX = 1600; // cap the working resolution so the flood stays fast on-device (px, longest side)

interface Loaded {
  data: Uint8ClampedArray;
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
}

async function load(src: string | Blob): Promise<Loaded> {
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no-2d-context");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, w, h, canvas, ctx, img };
}

/** Background reference = average of the four corners (a centred, margin'd product leaves them bg). */
function cornerRef(data: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const corners = [0, w - 1, (h - 1) * w, n - 1];
  let r = 0, g = 0, b = 0;
  for (const c of corners) {
    r += data[c * 4];
    g += data[c * 4 + 1];
    b += data[c * 4 + 2];
  }
  return { r: Math.round(r / 4), g: Math.round(g / 4), b: Math.round(b / 4) };
}

/** Is the outer border predominantly the corner colour? (i.e. a uniform studio/white background) */
function borderIsUniform(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  ref: { r: number; g: number; b: number },
): boolean {
  let sampled = 0;
  let near = 0;
  const check = (i: number) => {
    sampled++;
    const dr = data[i * 4] - ref.r, dg = data[i * 4 + 1] - ref.g, db = data[i * 4 + 2] - ref.b;
    if (dr * dr + dg * dg + db * db <= TOL * TOL) near++;
  };
  const step = Math.max(1, Math.round(Math.max(w, h) / 200));
  for (let x = 0; x < w; x += step) {
    check(x);
    check((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += step) {
    check(y * w);
    check(y * w + w - 1);
  }
  // Uniform studio/white cards sit well above this; busy rooms / worn selfies fall below.
  return sampled > 0 && near / sampled >= 0.9;
}

/** Border-seeded BFS: zero the alpha of every pixel connected to the frame edge within tolerance. */
function flood(data: Uint8ClampedArray, w: number, h: number, ref: { r: number; g: number; b: number }) {
  const n = w * h;
  const bg = new Uint8Array(n);
  const near = (i: number) => {
    const dr = data[i * 4] - ref.r, dg = data[i * 4 + 1] - ref.g, db = data[i * 4 + 2] - ref.b;
    return dr * dr + dg * dg + db * db <= TOL * TOL;
  };
  const stack: number[] = [];
  const push = (i: number) => {
    if (!bg[i] && near(i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  for (let i = 0; i < n; i++) if (bg[i]) data[i * 4 + 3] = 0;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob-failed"))), "image/png"),
  );
}

/** Always flood-fill the uniform background off `src` and return a transparent PNG. Use on inputs
 *  known to be on a uniform background (e.g. a Gemini product shot already flattened to white). */
export async function floodFillCutout(src: string | Blob): Promise<Blob> {
  const { data, w, h, canvas, ctx, img } = await load(src);
  flood(data, w, h, cornerRef(data, w, h));
  ctx.putImageData(img, 0, 0);
  return toBlob(canvas);
}

/** Flood-fill only when the outer background is uniform; else return null so the caller falls back
 *  to the normal cutout engine (worn selfies / busy backgrounds are not safe to flood). */
export async function floodFillIfUniform(src: string | Blob): Promise<Blob | null> {
  const { data, w, h, canvas, ctx, img } = await load(src);
  const ref = cornerRef(data, w, h);
  if (!borderIsUniform(data, w, h, ref)) return null;
  flood(data, w, h, ref);
  ctx.putImageData(img, 0, 0);
  return toBlob(canvas);
}
