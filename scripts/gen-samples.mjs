// AJA-199 — generate genuine beautified sample assets via the app's real pipeline.
// For each source garment: /api/beautify (Gemini ghost-mannequin on white) → an
// in-script border flood-fill outer-cutout (the Gemini bg is pure white/no shadow)
// → /api/beautify/refine (clean transparent sticker). Saves <slug>-white.png +
// <slug>-sticker.png into public/samples/<gender>/, resized for repo weight.
//
// Prereq: a dev server running in LOCAL mode (so requireUser bypasses auth) WITH
// GEMINI_API_KEY loaded:
//   NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev -- -p 3201
// Run:  node scripts/gen-samples.mjs [--only=slug] [--limit=N]

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = process.env.GEN_BASE || "http://localhost:3201";
const CANVAS = 1000;
const OUT_EDGE = 600; // downscale saved assets to bound repo size
const WHITE_MIN = 244; // near-white bg threshold for the flood fill
const CHROMA_MAX = 12;

// --- capsule config. Slugs are provisional; final names/colors are set from what
// each shot ACTUALLY renders as (Gemini redraws from the source photo). ---
const U = (id) => `https://images.unsplash.com/${id}?w=1000&q=80&auto=format&fit=crop`;
// `cut` picks the cutout engine per item: "flood" (default, in-script border flood-fill —
// best for simple garments Gemini renders on pure white) or "seg" (category-aware SegFormer
// via /api/cutout — semantic, strips studio-grey cards and isolates ONE garment from a worn
// outfit; but mangles low-contrast garments like a grey tee, so use flood for those).
//
// Already approved + generated, left untouched: women's white-shirt, camel-sweater, blue-jeans,
// trench-coat, black-dress, loafers, white-sneakers; men's white-oxford, grey-tee, white-sneakers.
// This run regenerates only the 6 items that needed a fix. Slugs are provisional; final
// names/colors come from what each shot ACTUALLY renders as (Gemini redraws the source).
const CAPSULE = [
  // Fix-run 6: men's 2nd shoe = leather loafers. The beautify prompt is garment-specific
  // (shoulders/sleeves), so footwear is hit-or-miss; loafer PAIRS on plain bg render reliably.
  // Two men's candidates + the proven source as a guaranteed fallback; keep the cleanest.
  { gender: "men", slug: "loafers-a", category: "shoes", cut: "flood", src: U("photo-1521330784804-5f69f8a17b1d") },
  { gender: "men", slug: "loafers-b", category: "shoes", cut: "flood", src: U("photo-1649503377051-e092f490c482") },
  { gender: "men", slug: "loafers", category: "shoes", cut: "flood", src: U("photo-1662541089338-c7d53b88be70") },
];

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));

async function postPng(path, body, tries = 3) {
  let last = "";
  for (let a = 1; a <= tries; a++) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    last = `${path} -> ${res.status}: ${(await res.text()).slice(0, 160)}`;
    // Gemini intermittently returns no image (fast 5xx); retry those. Client errors won't self-heal.
    if (res.status < 500 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 1500 * a));
  }
  throw new Error(last);
}

/** Border flood-fill removing the uniform outer background — keyed to the ACTUAL corner colour
 *  (handles white, gray or tinted studio backgrounds), within a tolerance. Interior regions and
 *  the (centred, margin'd) garment are untouched; refine then cleans interior openings. */
async function outerCutout(whitePng) {
  const { data } = await sharp(whitePng).resize(CANVAS, CANVAS, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const N = CANVAS * CANVAS;
  const bg = new Uint8Array(N);
  // Background reference = average of the four corners (garment is centred with margins).
  const corners = [0, CANVAS - 1, (CANVAS - 1) * CANVAS, N - 1];
  let bR = 0, bG = 0, bB = 0;
  for (const c of corners) { bR += data[c * 4]; bG += data[c * 4 + 1]; bB += data[c * 4 + 2]; }
  bR = Math.round(bR / 4); bG = Math.round(bG / 4); bB = Math.round(bB / 4);
  const TOL = 42; // colour distance from the bg reference to treat as background
  const near = (i) => {
    const dr = data[i * 4] - bR, dg = data[i * 4 + 1] - bG, db = data[i * 4 + 2] - bB;
    return dr * dr + dg * dg + db * db <= TOL * TOL;
  };
  const stack = [];
  const push = (i) => { if (!bg[i] && near(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < CANVAS; x++) { push(x); push((CANVAS - 1) * CANVAS + x); }
  for (let y = 0; y < CANVAS; y++) { push(y * CANVAS); push(y * CANVAS + CANVAS - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % CANVAS, y = (p / CANVAS) | 0;
    if (x > 0) push(p - 1);
    if (x < CANVAS - 1) push(p + 1);
    if (y > 0) push(p - CANVAS);
    if (y < CANVAS - 1) push(p + CANVAS);
  }
  for (let i = 0; i < N; i++) if (bg[i]) data[i * 4 + 3] = 0;
  return sharp(data, { raw: { width: CANVAS, height: CANVAS, channels: 4 } }).png().toBuffer();
}

const dataUrl = (buf) => `data:image/png;base64,${buf.toString("base64")}`;

/** Category-aware SegFormer garment cutout via /api/cutout — semantic, so it removes any
 *  background (incl. Gemini's occasional studio-grey card) and keeps only the garment of the
 *  item's category (isolating one piece from a worn outfit). Returns a transparent PNG. */
async function segCutout(whitePng, category) {
  const res = await fetch(`${BASE}/api/cutout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageData: dataUrl(whitePng), category }),
  });
  if (!res.ok) throw new Error(`/api/cutout -> ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function run() {
  let items = CAPSULE;
  if (args.only) items = items.filter((i) => i.slug === args.only);
  if (args.limit) items = items.slice(0, Number(args.limit));

  const done = {};
  for (const it of items) {
    const t0 = Date.now();
    process.stdout.write(`• ${it.gender}/${it.slug} … `);
    try {
      const white = await postPng("/api/beautify", { imageUrl: it.src });
      const cut = it.cut === "seg" ? await segCutout(white, it.category) : await outerCutout(white);
      const sticker = await postPng("/api/beautify/refine", { whiteData: dataUrl(white), cutData: dataUrl(cut) });

      const dir = join("public", "samples", it.gender);
      await mkdir(dir, { recursive: true });
      await sharp(white).resize(OUT_EDGE, OUT_EDGE, { fit: "inside" }).png({ compressionLevel: 9 }).toFile(join(dir, `${it.slug}-white.png`));
      await sharp(sticker).resize(OUT_EDGE, OUT_EDGE, { fit: "inside" }).png({ compressionLevel: 9 }).toFile(join(dir, `${it.slug}-sticker.png`));
      (done[it.gender] ??= []).push(it.slug);
      console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  // Contact sheet(s) for eyeballing — light-gray tiles so transparency + edges show.
  for (const [gender, slugs] of Object.entries(done)) {
    const CELL = 260, COLS = 4, PAD = 8;
    const rows = Math.ceil(slugs.length / COLS);
    const tiles = await Promise.all(
      slugs.map(async (slug, i) => ({
        input: await sharp(join("public", "samples", gender, `${slug}-sticker.png`))
          .resize(CELL - PAD * 2, CELL - PAD * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png().toBuffer(),
        left: (i % COLS) * CELL + PAD,
        top: Math.floor(i / COLS) * CELL + PAD,
      })),
    );
    const sheet = join("/private/tmp/claude-501/-Users-ajaythirumurthi/67b438fa-45f9-4e27-acf5-ae317a939c31/scratchpad", `contact-${gender}.png`);
    await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 3, background: "#e7e5e0" } })
      .composite(tiles).png().toFile(sheet);
    console.log(`contact sheet: ${sheet} (${slugs.join(", ")})`);
  }
}

run();
