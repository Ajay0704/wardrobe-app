/**
 * AJA-301 — calibrate "looks like something you already own". LOCAL ONLY: it calls
 * Gemini, so it needs GEMINI_API_KEY and never runs in CI.
 *
 *   GEMINI_API_KEY=… node --experimental-strip-types --experimental-loader \
 *     ./scripts/reshook.mjs scripts/calibrate-visual-dupes.mts [--write-fixture]
 *
 * Uses the 16 sample garments in public/samples, each rendered twice: on white (stands
 * in for a retailer product shot — the wish) and as a transparent cut-out (stands in for
 * a closet piece). Every same-category pair is scored across those formats.
 *
 * Labels are by hand. "Very similar" means a second one of the same thing: two white
 * sneakers, a white shirt and a white oxford. Same garment type in a different colour
 * (navy vs camel sweater, dark vs light jeans, black vs tan loafers) is NOT — that's the
 * case image embeddings are said to be weak on, and the reason a colour veto exists.
 *
 * Reports score ranges per label for each variant (flatten background, 768 vs 256
 * dims), the gap between the weakest positive and the strongest negative, and which
 * negatives a colour veto would catch. --write-fixture saves the chosen variant's
 * vectors for scripts/test-visual-dupes.mts.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const { embedImages } = await import("@/lib/visual-embed-server");
const { cosine, decodeVector, quantizeVector, VISUAL_DIM, VISUAL_MODEL } = await import("@/lib/visual-similarity");

const KEY = process.env.GEMINI_API_KEY ?? "";
if (!KEY) {
  console.error("GEMINI_API_KEY is not set — this script calls the real model.");
  process.exit(1);
}
const ROOT = process.cwd();
const SAMPLES = path.join(ROOT, "public/samples");

/** slug → [category, colour hex, label]. Colours by eye from the renders. */
const GARMENTS: Record<string, [string, string, string]> = {
  "women/white-shirt": ["top", "#f4f4f2", "white shirt"],
  "women/camel-sweater": ["top", "#c19a6b", "camel sweater"],
  "men/white-oxford": ["top", "#f2f2f0", "white oxford"],
  "men/navy-sweater": ["top", "#1f2a44", "navy sweater"],
  "men/grey-tee": ["top", "#8a8a8a", "grey tee"],
  "women/blue-jeans": ["bottom", "#a7c4e0", "light-blue jeans"],
  "women/trousers": ["bottom", "#b8a99a", "taupe trousers"],
  "men/chinos": ["bottom", "#708238", "olive chinos"],
  "men/dark-jeans": ["bottom", "#2b3a67", "indigo jeans"],
  "women/trench-coat": ["outerwear", "#d8c3a5", "beige trench"],
  "men/field-jacket": ["outerwear", "#f3ead8", "cream overshirt"],
  "women/black-dress": ["dress", "#111111", "black dress"],
  "women/loafers": ["shoes", "#c69c6d", "tan loafers"],
  "women/white-sneakers": ["shoes", "#f2f2f2", "white sneakers (w)"],
  "men/loafers": ["shoes", "#151515", "black loafers"],
  "men/white-sneakers": ["shoes", "#f2f2f2", "white sneakers (m)"],
};
/** Different pieces that ARE "a second one of the same thing". Everything else in a category is not. */
const NEAR_DUPES = new Set(["men/white-oxford|women/white-shirt", "men/white-sneakers|women/white-sneakers"]);
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

type Variant = { bg: string; dims: number };
const VARIANTS: Variant[] = [
  { bg: "#ffffff", dims: 768 },
  { bg: "#ffffff", dims: 256 },
  { bg: "#e9e9e9", dims: 768 },
];

async function prep(file: string, bg: string): Promise<string | null> {
  try {
    const out = await sharp(fs.readFileSync(file)).rotate().flatten({ background: bg })
      .resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

/** Matryoshka truncation: the first `dims` components, renormalised. */
const truncate = (v: number[], dims: number) => {
  const t = v.slice(0, dims);
  const n = Math.sqrt(t.reduce((s, x) => s + x * x, 0)) || 1;
  return t.map((x) => x / n);
};
const fcos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

// Embed every rendering once per background (dims are a truncation of the same call).
const slugs = Object.keys(GARMENTS);
const byBg = new Map<string, Map<string, number[]>>();
for (const bg of [...new Set(VARIANTS.map((v) => v.bg))]) {
  const keys: string[] = [];
  const imgs: (string | null)[] = [];
  for (const s of slugs) {
    for (const kind of ["white", "sticker"]) {
      keys.push(`${s}-${kind}`);
      imgs.push(await prep(path.join(SAMPLES, `${s}-${kind}.png`), bg));
    }
  }
  const vecs: (number[] | null)[] = [];
  for (let i = 0; i < imgs.length; i += 16) vecs.push(...(await embedImages(imgs.slice(i, i + 16), KEY)));
  const m = new Map<string, number[]>();
  keys.forEach((k, i) => vecs[i] && m.set(k, vecs[i]!));
  console.log(`bg ${bg}: embedded ${m.size}/${keys.length} renderings`);
  if (m.size !== keys.length) {
    console.error("Some renderings failed to embed — results would be partial. Stopping.");
    process.exit(1);
  }
  byBg.set(bg, m);
}

type Row = { label: "same piece, two formats" | "near-duplicate" | "different piece"; a: string; b: string; score: number };
function score(v: Variant): Row[] {
  const m = byBg.get(v.bg)!;
  const get = (k: string) => truncate(m.get(k)!, v.dims);
  const rows: Row[] = [];
  for (const s of slugs) rows.push({ label: "same piece, two formats", a: s, b: s, score: fcos(get(`${s}-white`), get(`${s}-sticker`)) });
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const [a, b] = [slugs[i], slugs[j]];
      if (GARMENTS[a][0] !== GARMENTS[b][0]) continue; // the category gate comes first in smart-buy
      // Wish photographed on white vs closet cut-out, both directions, averaged.
      const sc = (fcos(get(`${a}-white`), get(`${b}-sticker`)) + fcos(get(`${b}-white`), get(`${a}-sticker`))) / 2;
      rows.push({ label: NEAR_DUPES.has(pairKey(a, b)) ? "near-duplicate" : "different piece", a, b, score: sc });
    }
  }
  return rows;
}

const name = (s: string) => GARMENTS[s][2];
const fmt = (x: number) => x.toFixed(3);
for (const v of VARIANTS) {
  const rows = score(v);
  console.log(`\n=== flatten ${v.bg} · ${v.dims} dims ===`);
  for (const label of ["same piece, two formats", "near-duplicate", "different piece"] as const) {
    const xs = rows.filter((r) => r.label === label).map((r) => r.score);
    console.log(`  ${label.padEnd(24)} n=${String(xs.length).padStart(2)}  min ${fmt(Math.min(...xs))}  mean ${fmt(xs.reduce((s, x) => s + x, 0) / xs.length)}  max ${fmt(Math.max(...xs))}`);
  }
  const pos = rows.filter((r) => r.label !== "different piece").sort((a, b) => a.score - b.score);
  const neg = rows.filter((r) => r.label === "different piece").sort((a, b) => b.score - a.score);
  console.log(`  GAP weakest positive − strongest negative: ${fmt(pos[0].score - neg[0].score)}`);
  console.log("  weakest positives:");
  for (const r of pos.slice(0, 3)) console.log(`    ${fmt(r.score)}  ${r.label === "near-duplicate" ? `${name(r.a)} ~ ${name(r.b)}` : `${name(r.a)} (white vs cut-out)`}`);
  console.log("  strongest negatives:");
  for (const r of neg.slice(0, 6)) console.log(`    ${fmt(r.score)}  ${name(r.a)} vs ${name(r.b)}`);
}

// The colour veto: a pair whose KNOWN colours are clearly different is never a duplicate,
// however alike the shapes (image embeddings are weak on colour — navy vs camel sweater
// scores like near-twins). Uses smart-buy's own colour test, so this measures what ships.
const { similarColor } = await import("@/lib/smart-buy");
const vetoed = (a: string, b: string) => !similarColor(GARMENTS[a][1], GARMENTS[b][1]);
for (const v of VARIANTS) {
  const rows = score(v);
  const pos = rows.filter((r) => r.label !== "different piece");
  const negKept = rows.filter((r) => r.label === "different piece" && !vetoed(r.a, r.b)).sort((a, b) => b.score - a.score);
  const posVetoed = pos.filter((r) => r.label === "near-duplicate" && vetoed(r.a, r.b));
  console.log(`\n--- with colour veto · flatten ${v.bg} · ${v.dims} dims ---`);
  console.log(`  negatives the veto leaves standing: ${negKept.length}; strongest ${negKept[0] ? `${fmt(negKept[0].score)} (${name(negKept[0].a)} vs ${name(negKept[0].b)})` : "none"}`);
  console.log(`  near-duplicates the veto wrongly kills: ${posVetoed.length}`);
  const minPos = Math.min(...pos.map((r) => r.score));
  console.log(`  GAP with veto: ${fmt(minPos - (negKept[0]?.score ?? 0))}  (weakest positive ${fmt(minPos)})`);
  for (const t of [0.72, 0.76, 0.8, 0.84]) {
    const tp = pos.filter((r) => r.score >= t && !(r.label === "near-duplicate" && vetoed(r.a, r.b))).length;
    const fp = negKept.filter((r) => r.score >= t).length;
    console.log(`    T=${t.toFixed(2)}  caught ${tp}/${pos.length} positives, ${fp} false positives`);
  }
}

// Quantised (what the app stores) must agree with float for the chosen variant.
const chosen = VARIANTS[0];
const m = byBg.get(chosen.bg)!;
let worst = 0;
for (const [a, va] of m) for (const [b, vb] of m) {
  if (a >= b) continue;
  const q = cosine(decodeVector(quantizeVector(va))!, decodeVector(quantizeVector(vb))!);
  worst = Math.max(worst, Math.abs(q - fcos(va, vb)));
}
console.log(`\nint8 vs float cosine, worst Δ over all ${m.size} renderings: ${worst.toFixed(4)}`);

if (process.argv.includes("--write-fixture")) {
  const out = path.join(ROOT, "scripts/fixtures/visual-samples.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const vectors: Record<string, string> = {};
  for (const k of [...m.keys()].sort()) vectors[k] = quantizeVector(m.get(k)!);
  fs.writeFileSync(out, JSON.stringify({
    note: "AJA-301 calibration vectors for public/samples — written by scripts/calibrate-visual-dupes.mts. Regenerate, don't hand-edit.",
    model: VISUAL_MODEL, dims: VISUAL_DIM, prep: { flatten: chosen.bg, maxSide: 512, format: "jpeg q85" },
    garments: Object.fromEntries(slugs.map((s) => [s, { category: GARMENTS[s][0], color: GARMENTS[s][1], name: GARMENTS[s][2] }])),
    nearDuplicates: [...NEAR_DUPES],
    vectors,
  }, null, 1) + "\n");
  console.log(`wrote ${path.relative(ROOT, out)} (${Object.keys(vectors).length} vectors)`);
}
