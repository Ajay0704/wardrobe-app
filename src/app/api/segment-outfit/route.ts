/**
 * Whole-outfit detector — Grounding DINO (open-vocabulary object detection) on
 * Replicate. This is the "Grounded-SAM" detection backbone: you name the garments
 * you want ("shirt, pants, shoes, jacket, belt, bag") and it returns a reliable
 * box + label per item — the thing a general LLM's bounding boxes were flaky at.
 *
 * Returns boxes only (normalized 0-1) + a mapped category; attributes (name,
 * colour, seasons, tags) are filled per-crop by /api/analyze on the client, and
 * the box is cut out on-device. Needs REPLICATE_API_TOKEN; without it we 501 and
 * the client falls back to the Gemini detector, then SegFormer, then a single cut.
 */
import sharp from "sharp";
import { requireUser } from "@/lib/auth-server";
import { safeFetch } from "@/lib/net";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Comma-separated garment vocabulary Grounding DINO looks for.
// Kept deliberately concise — Grounding DINO degrades with long, cluttered
// queries (a longer jacket list actually LOST the blazer in testing).
const GARMENT_VOCAB =
  "shirt, t-shirt, blouse, sweater, hoodie, cardigan, jacket, blazer, coat, " +
  "pants, jeans, trousers, shorts, skirt, dress, shoes, sneakers, boots, heels, " +
  "sandals, handbag, backpack, tote bag, hat, cap, belt, scarf, sunglasses, watch";

// Accessories (belts/hats/etc.) fire noisy, low-confidence boxes — require a higher
// bar and cap how many we keep so they don't create junk items.
const ACCESSORY_FLOOR = 0.45;
const ACCESSORY_MAX = 2;

// Pinned adirik/grounding-dino version. This model 404s on the model-scoped
// predictions endpoint, so we run it via the version-based /v1/predictions.
const GROUNDING_DINO_VERSION =
  "efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa";

/** Map a detected label to one of our 7 categories. Outerwear before top so a
 *  "jacket"/"blazer" doesn't get swallowed as a top. */
function mapCategory(label: string): Category | null {
  const v = label.toLowerCase();
  if (/(jacket|blazer|coat|parka|overcoat|windbreaker|outerwear)/.test(v)) return "outerwear";
  if (/(dress|gown|jumpsuit|romper)/.test(v)) return "dress";
  if (/(shoe|sneaker|boot|heel|sandal|loafer|trainer|footwear)/.test(v)) return "shoes";
  if (/(pant|jean|trouser|short|skirt|legging|chino|bottom|slacks)/.test(v)) return "bottom";
  if (/(shirt|t-?shirt|tee|blouse|sweater|hoodie|cardigan|top|tank|polo|knit)/.test(v)) return "top";
  if (/(bag|purse|tote|backpack|clutch|handbag)/.test(v)) return "bag";
  if (/(hat|cap|scarf|belt|sunglass|watch|jewel|necklace|tie|glove|accessor)/.test(v)) return "accessory";
  return null;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Garment {
  category: Category;
  label: string;
  box: Box;
  score: number;
}

const area = (b: Box) => b.w * b.h;
function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

/** Drop lower-confidence boxes that overlap a kept box (near-duplicate detections). */
function dedupe(items: Garment[], thresh = 0.6): Garment[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const kept: Garment[] = [];
  for (const g of sorted) {
    if (!kept.some((k) => iou(k.box, g.box) > thresh)) kept.push(g);
  }
  return kept;
}

/** Decode the incoming image to raw bytes + dimensions (Grounding DINO boxes are
 *  pixels relative to the input image, so we need its width/height to normalize). */
async function imageDims(image: string): Promise<{ width: number; height: number } | null> {
  try {
    let buf: Buffer;
    const m = /^data:([^;]+);base64,(.+)$/.exec(image);
    if (m) {
      buf = Buffer.from(m[2], "base64");
    } else {
      const res = await safeFetch(image, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      buf = Buffer.from(await res.arrayBuffer());
    }
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

interface Detection {
  label?: string;
  confidence?: number;
  bbox?: number[];
}

export async function POST(request: Request) {
  if (!(await requireUser(request))) {
    return Response.json({ error: "Please sign in to use this." }, { status: 401 });
  }
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return Response.json(
      { error: "Segmentation isn't configured yet (missing REPLICATE_API_TOKEN)." },
      { status: 501 },
    );
  }

  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.image) return Response.json({ error: "No image provided." }, { status: 400 });

  const dims = await imageDims(body.image);
  if (!dims) return Response.json({ error: "Couldn't read that image." }, { status: 400 });

  type Prediction = {
    status?: string;
    error?: unknown;
    output?: { detections?: Detection[] } | null;
    urls?: { get?: string };
  };
  let prediction: Prediction;
  try {
    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // Block until the prediction finishes (up to ~60s) instead of polling.
        Prefer: "wait",
      },
      body: JSON.stringify({
        version: GROUNDING_DINO_VERSION,
        input: { image: body.image, query: GARMENT_VOCAB, box_threshold: 0.35, text_threshold: 0.25 },
      }),
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return Response.json({ error: `Detection error (${res.status}).`, detail }, { status: 502 });
    }
    prediction = (await res.json()) as Prediction;
    // Cold start can return before completion — poll a few times.
    let tries = 0;
    while (
      prediction.status &&
      !["succeeded", "failed", "canceled"].includes(prediction.status) &&
      prediction.urls?.get &&
      tries++ < 18
    ) {
      await new Promise((r) => setTimeout(r, 2000));
      prediction = (await (await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${token}` } })).json()) as Prediction;
    }
  } catch {
    return Response.json({ error: "Couldn't reach the detection service." }, { status: 502 });
  }
  if (prediction.status !== "succeeded") {
    return Response.json({ error: "Detection failed." }, { status: 502 });
  }

  const detections = prediction.output?.detections ?? [];
  const { width: W, height: H } = dims;
  const garments = detections
    .map((d): Garment | null => {
      const category = mapCategory(d.label ?? "");
      const bb = d.bbox;
      if (!category || !Array.isArray(bb) || bb.length !== 4) return null;
      const [x1, y1, x2, y2] = bb.map(Number);
      if ([x1, y1, x2, y2].some((n) => !Number.isFinite(n))) return null;
      const box: Box = {
        x: Math.max(0, Math.min(1, Math.min(x1, x2) / W)),
        y: Math.max(0, Math.min(1, Math.min(y1, y2) / H)),
        w: Math.max(0, Math.min(1, Math.abs(x2 - x1) / W)),
        h: Math.max(0, Math.min(1, Math.abs(y2 - y1) / H)),
      };
      if (box.w < 0.02 || box.h < 0.02) return null;
      return { category, label: d.label ?? category, box, score: Number(d.confidence) || 0 };
    })
    .filter((g): g is Garment => Boolean(g));

  // Merge left/right shoe detections into a single "shoes" pair.
  const deduped = dedupe(garments);
  const shoes = deduped.filter((g) => g.category === "shoes");
  const result = deduped.filter((g) => g.category !== "shoes");
  if (shoes.length) {
    const bs = shoes.map((s) => s.box);
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    result.push({
      category: "shoes",
      label: "shoes",
      score: Math.max(...shoes.map((s) => s.score)),
      box: {
        x,
        y,
        w: Math.max(...bs.map((b) => b.x + b.w)) - x,
        h: Math.max(...bs.map((b) => b.y + b.h)) - y,
      },
    });
  }

  // Accessory tuning: keep only confident accessories, capped.
  const accessories = result
    .filter((g) => g.category === "accessory" && g.score >= ACCESSORY_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, ACCESSORY_MAX);
  const kept = result.filter((g) => g.category !== "accessory").concat(accessories);

  return Response.json({ garments: kept.slice(0, 12) });
}
