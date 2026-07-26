/**
 * Lightweight style embeddings for mood/occasion ranking (AJA-38 Phase 2).
 *
 * Closets are small, so we score in-process with a deterministic bag-of-features
 * vector derived from category, formality, tags, seasons, color, and optional
 * styleCaption. No external embedding API required; when analyze returns a
 * caption we fold it into the same space.
 */

import { hexToHsl } from "./color";
import type { Season, WardrobeItem } from "./types";

/** Fixed vocab dimensions — order is the embedding axis. */
const VOCAB = [
  // categories
  "cat:top",
  "cat:bottom",
  "cat:dress",
  "cat:outerwear",
  "cat:shoes",
  "cat:bag",
  "cat:accessory",
  // formality
  "form:casual",
  "form:smart-casual",
  "form:formal",
  "form:statement",
  // seasons
  "szn:spring",
  "szn:summer",
  "szn:fall",
  "szn:winter",
  // vibes / tags / moods
  "vibe:casual",
  "vibe:work",
  "vibe:formal",
  "vibe:party",
  "vibe:date",
  "vibe:minimal",
  "vibe:streetwear",
  "vibe:athleisure",
  "vibe:vintage",
  "vibe:cozy",
  "vibe:travel",
  "vibe:evening",
  "vibe:interview",
  "vibe:brunch",
  "vibe:wedding",
  // materials / patterns (from caption or attrs)
  "mat:cotton",
  "mat:linen",
  "mat:wool",
  "mat:denim",
  "mat:silk",
  "mat:leather",
  "mat:knit",
  "pat:solid",
  "pat:stripe",
  "pat:print",
  "pat:check",
  // color families
  "col:neutral",
  "col:black",
  "col:white",
  "col:warm",
  "col:cool",
  "col:red",
  "col:blue",
  "col:green",
  "col:earth",
] as const;

const INDEX = new Map<string, number>(VOCAB.map((t, i) => [t, i]));
export const EMBED_DIM = VOCAB.length;

function add(vec: number[], key: string, w = 1) {
  const i = INDEX.get(key);
  if (i != null) vec[i] += w;
}

function colorKeys(item: Pick<WardrobeItem, "color" | "colorName" | "tone">): string[] {
  const tone = (item.tone || item.colorName || "").toLowerCase();
  const keys: string[] = [];
  if (/black|charcoal/.test(tone)) keys.push("col:black");
  else if (/white|ivory|cream/.test(tone)) keys.push("col:white");
  else if (/beige|tan|brown|camel|khaki|olive|earth/.test(tone)) keys.push("col:earth", "col:warm");
  else if (/navy|blue|teal|cool/.test(tone)) keys.push("col:blue", "col:cool");
  else if (/red|burgundy|pink|coral|warm/.test(tone)) keys.push("col:red", "col:warm");
  else if (/green/.test(tone)) keys.push("col:green");
  else if (/grey|gray|neutral/.test(tone)) keys.push("col:neutral");
  else if (item.color) {
    const hsl = hexToHsl(item.color);
    if (hsl.s <= 14 || hsl.l <= 10 || hsl.l >= 92) keys.push("col:neutral");
    else if (hsl.h < 40 || hsl.h > 330) keys.push("col:red", "col:warm");
    else if (hsl.h < 90) keys.push("col:earth", "col:warm");
    else if (hsl.h < 160) keys.push("col:green");
    else keys.push("col:blue", "col:cool");
  } else keys.push("col:neutral");
  return keys;
}

const TAG_MAP: Record<string, string> = {
  casual: "vibe:casual",
  work: "vibe:work",
  office: "vibe:work",
  formal: "vibe:formal",
  party: "vibe:party",
  "date night": "vibe:date",
  date: "vibe:date",
  minimal: "vibe:minimal",
  streetwear: "vibe:streetwear",
  athleisure: "vibe:athleisure",
  vintage: "vibe:vintage",
  cozy: "vibe:cozy",
  travel: "vibe:travel",
  trip: "vibe:travel",
  evening: "vibe:evening",
  interview: "vibe:interview",
  brunch: "vibe:brunch",
  wedding: "vibe:wedding",
};

function tokenizeCaption(text: string): string[] {
  const t = text.toLowerCase();
  const keys: string[] = [];
  for (const [word, key] of Object.entries(TAG_MAP)) {
    if (t.includes(word)) keys.push(key);
  }
  if (/cotton/.test(t)) keys.push("mat:cotton");
  if (/linen/.test(t)) keys.push("mat:linen");
  if (/wool|cashmere/.test(t)) keys.push("mat:wool");
  if (/denim|jean/.test(t)) keys.push("mat:denim");
  if (/silk|satin/.test(t)) keys.push("mat:silk");
  if (/leather/.test(t)) keys.push("mat:leather");
  if (/knit|sweater|cardigan/.test(t)) keys.push("mat:knit");
  if (/stripe/.test(t)) keys.push("pat:stripe");
  if (/check|plaid/.test(t)) keys.push("pat:check");
  if (/print|floral|pattern/.test(t)) keys.push("pat:print");
  if (/solid|plain/.test(t)) keys.push("pat:solid");
  return keys;
}

function l2normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const n = Math.sqrt(sum) || 1;
  return vec.map((v) => v / n);
}

/** Build (or refresh) a style embedding for a wardrobe item. */
export function embedItem(
  item: Pick<
    WardrobeItem,
    | "category"
    | "formality"
    | "tags"
    | "seasons"
    | "color"
    | "colorName"
    | "tone"
    | "styleCaption"
    | "material"
    | "pattern"
    | "styleEmbedding"
  >,
): number[] {
  if (item.styleEmbedding && item.styleEmbedding.length === EMBED_DIM) {
    return item.styleEmbedding;
  }
  const vec = new Array(EMBED_DIM).fill(0);
  add(vec, `cat:${item.category}`, 1.2);
  const form = (item.formality || "casual").toLowerCase();
  if (form.includes("formal") && !form.includes("smart")) add(vec, "form:formal", 1.1);
  else if (form.includes("smart")) add(vec, "form:smart-casual", 1.1);
  else if (form.includes("statement")) add(vec, "form:statement", 1.1);
  else add(vec, "form:casual", 1.0);
  for (const s of item.seasons ?? []) add(vec, `szn:${s}`, 0.8);
  for (const tag of item.tags ?? []) {
    const key = TAG_MAP[tag.toLowerCase()];
    if (key) add(vec, key, 1.0);
  }
  for (const k of colorKeys(item)) add(vec, k, 0.7);
  if (item.material) {
    const m = item.material.toLowerCase();
    for (const key of tokenizeCaption(m)) add(vec, key, 0.9);
  }
  if (item.pattern) {
    for (const key of tokenizeCaption(item.pattern)) add(vec, key, 0.9);
  }
  if (item.styleCaption) {
    for (const key of tokenizeCaption(item.styleCaption)) add(vec, key, 0.85);
  }
  return l2normalize(vec);
}

/** Embed a free-text mood / occasion query into the same space. */
export function embedQuery(
  query: string,
  extras?: { vibe?: string; season?: Season | "all"; formality?: string },
): number[] {
  const vec = new Array(EMBED_DIM).fill(0);
  for (const key of tokenizeCaption(query)) add(vec, key, 1.2);
  if (extras?.vibe) {
    const key = TAG_MAP[extras.vibe.toLowerCase()];
    if (key) add(vec, key, 1.4);
  }
  if (extras?.season && extras.season !== "all") add(vec, `szn:${extras.season}`, 1.0);
  if (extras?.formality) {
    const f = extras.formality.toLowerCase();
    if (f.includes("formal") && !f.includes("smart")) add(vec, "form:formal", 1.3);
    else if (f.includes("smart")) add(vec, "form:smart-casual", 1.3);
    else add(vec, "form:casual", 1.1);
  }
  // Occasion synonyms from common chips
  const q = query.toLowerCase();
  if (/\bwork|office|meeting\b/.test(q)) add(vec, "vibe:work", 1.3);
  if (/\bdate|night out\b/.test(q)) add(vec, "vibe:date", 1.3);
  if (/\bwedding|gala|black tie\b/.test(q)) add(vec, "vibe:wedding", 1.3);
  if (/\btrip|travel|airport\b/.test(q)) add(vec, "vibe:travel", 1.3);
  if (/\binterview\b/.test(q)) add(vec, "vibe:interview", 1.4);
  if (/\bbrunch|cafe\b/.test(q)) add(vec, "vibe:brunch", 1.2);
  return l2normalize(vec);
}

/** Cosine similarity in [0, 1] (shifted from [-1,1]). */
export function cosineAffinity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0.5;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, (dot + 1) / 2));
}

/** Average affinity of items to a query embedding. */
export function outfitQueryAffinity(items: WardrobeItem[], queryVec: number[]): number {
  if (!items.length) return 0.5;
  const scores = items.map((it) => cosineAffinity(embedItem(it), queryVec));
  return scores.reduce((s, v) => s + v, 0) / scores.length;
}
