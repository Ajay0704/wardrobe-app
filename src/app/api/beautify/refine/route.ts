/**
 * Beautify sticker refine (AJA-124). Turns the ghost-mannequin garment into a clean transparent
 * "sticker" for the outfit canvas:
 *   1. takes the garment-on-white image + the outer-background cutout (from the existing removal step),
 *   2. clears enclosed near-pure-white OPENINGS inside the garment (neck hole, cuff gaps, arm/torso
 *      gaps) that the outer cutout leaves as white blobs — with a guardrail so white/pale logos,
 *      prints and panels (which are NOT pure-white background) survive,
 *   3. feathers the alpha for soft (alpha-matting-style) edges, and
 *   4. trims to the garment bbox and centres it on a fixed transparent CANVAS×CANVAS square so every
 *      item shares scale and framing.
 * Colours come from the clean white image (no removal fringing); the silhouette alpha comes from the
 * cutout. All 2D: the output is a flat transparent PNG that depicts ghost-mannequin volume.
 */
import { requireUser } from "@/lib/auth-server";
import { safeFetch } from "@/lib/net";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

const CANVAS = 1000; // fixed square edge (matches /api/beautify + beautify.ts)
const FILL = 900; // garment longest side ≈ 90% of the canvas

// Near-pure-white = the flat background showing through an opening. Tight thresholds keep garment
// fabric, pale panels and off-white prints (which are not pure neutral white) from being cleared.
const WHITE_MIN = 250; // all channels ≥ this
const CHROMA_MAX = 8; // max−min channel spread ≤ this (achromatic)
const KEEP_ALPHA = 25; // cutout alpha above this = the removal kept this pixel (candidate opening)
const GARMENT_ALPHA = 128; // alpha at/above this counts toward garment area
const MIN_HOLE = 300; // px; smaller white islands are logo/print detail → keep
const MAX_HOLE_FRAC = 0.35; // white island larger than this share of the garment = a white garment body → keep
const FEATHER_R = 2; // alpha box-blur radius → soft (alpha-matting-style) edges

/** Separable box blur on a single-channel alpha map → feathered (soft) edges. */
function featherAlpha(a: Uint8ClampedArray, W: number, H: number, r: number): Uint8ClampedArray {
  const tmp = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < W) { s += a[y * W + xx]; n++; }
      }
      tmp[y * W + x] = s / n;
    }
  }
  const out = new Uint8ClampedArray(W * H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let s = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < H) { s += tmp[yy * W + x]; n++; }
      }
      out[y * W + x] = s / n;
    }
  }
  return out;
}

async function toBuf(data?: string, url?: string): Promise<Buffer> {
  if (data?.startsWith("data:")) return Buffer.from(data.split(",")[1] ?? "", "base64");
  if (url) {
    const res = await safeFetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error("fetch-failed");
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("no-source");
}

/** RGBA raw buffer at CANVAS×CANVAS. */
async function rgba(buf: Buffer): Promise<Buffer> {
  return sharp(buf).resize(CANVAS, CANVAS, { fit: "fill" }).ensureAlpha().raw().toBuffer();
}

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  let body: { whiteData?: string; whiteUrl?: string; cutData?: string; cutUrl?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  let white: Buffer;
  let cut: Buffer;
  try {
    white = await rgba(await toBuf(body.whiteData, body.whiteUrl));
    cut = await rgba(await toBuf(body.cutData, body.cutUrl));
  } catch (e) {
    return Response.json({ error: `source: ${(e as Error).message}` }, { status: 502 });
  }

  try {
    const N = CANVAS * CANVAS;
    const alpha = new Uint8ClampedArray(N); // start from the cutout silhouette
    const cand = new Uint8Array(N); // pure-white pixels the cutout kept (opening / white garment / logo)
    let garmentArea = 0;
    for (let i = 0; i < N; i++) {
      const a = cut[i * 4 + 3];
      alpha[i] = a;
      if (a >= GARMENT_ALPHA) garmentArea++;
      const r = white[i * 4];
      const g = white[i * 4 + 1];
      const b = white[i * 4 + 2];
      const isWhite = r >= WHITE_MIN && g >= WHITE_MIN && b >= WHITE_MIN && Math.max(r, g, b) - Math.min(r, g, b) <= CHROMA_MAX;
      cand[i] = isWhite && a > KEEP_ALPHA ? 1 : 0;
    }

    // Label 4-connected components of the candidate white pixels (iterative BFS).
    const label = new Int32Array(N);
    const stack = new Int32Array(N);
    const areas: number[] = [0];
    let comp = 0;
    for (let s = 0; s < N; s++) {
      if (!cand[s] || label[s]) continue;
      comp++;
      let area = 0;
      let sp = 0;
      stack[sp++] = s;
      label[s] = comp;
      while (sp) {
        const p = stack[--sp];
        area++;
        const x = p % CANVAS;
        const y = (p / CANVAS) | 0;
        if (x > 0 && cand[p - 1] && !label[p - 1]) { label[p - 1] = comp; stack[sp++] = p - 1; }
        if (x < CANVAS - 1 && cand[p + 1] && !label[p + 1]) { label[p + 1] = comp; stack[sp++] = p + 1; }
        if (y > 0 && cand[p - CANVAS] && !label[p - CANVAS]) { label[p - CANVAS] = comp; stack[sp++] = p - CANVAS; }
        if (y < CANVAS - 1 && cand[p + CANVAS] && !label[p + CANVAS]) { label[p + CANVAS] = comp; stack[sp++] = p + CANVAS; }
      }
      areas[comp] = area;
    }

    // Clear openings: white islands within the size window. Below MIN_HOLE = logo/print detail (keep);
    // above MAX_HOLE_FRAC of the garment = a white garment body, not an opening (keep).
    const maxHole = MAX_HOLE_FRAC * Math.max(garmentArea, 1);
    const clear = new Uint8Array(comp + 1);
    for (let c = 1; c <= comp; c++) if (areas[c] >= MIN_HOLE && areas[c] <= maxHole) clear[c] = 1;
    for (let i = 0; i < N; i++) if (clear[label[i]]) alpha[i] = 0;

    // Feather the alpha (soft edges on the silhouette + the freshly-cleared openings).
    const feathered = featherAlpha(alpha, CANVAS, CANVAS, FEATHER_R);

    // Alpha bounding box → trim; garment colours come from the clean white image.
    let minX = CANVAS, minY = CANVAS, maxX = -1, maxY = -1;
    const out = Buffer.alloc(N * 4);
    for (let i = 0; i < N; i++) {
      out[i * 4] = white[i * 4];
      out[i * 4 + 1] = white[i * 4 + 1];
      out[i * 4 + 2] = white[i * 4 + 2];
      const a = feathered[i];
      out[i * 4 + 3] = a;
      if (a > 10) {
        const x = i % CANVAS;
        const y = (i / CANVAS) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return Response.json({ error: "Empty sticker." }, { status: 422 });

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const cropped = await sharp(out, { raw: { width: CANVAS, height: CANVAS, channels: 4 } })
      .extract({ left: minX, top: minY, width: bw, height: bh })
      .resize(FILL, FILL, { fit: "inside" })
      .png()
      .toBuffer();
    const meta = await sharp(cropped).metadata();
    const left = Math.max(0, Math.round((CANVAS - (meta.width ?? FILL)) / 2));
    const top = Math.max(0, Math.round((CANVAS - (meta.height ?? FILL)) / 2));
    const png = await sharp({
      create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: cropped, left, top }])
      .png()
      .toBuffer();

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json({ error: `refine failed: ${(e as Error).message}` }, { status: 500 });
  }
}
