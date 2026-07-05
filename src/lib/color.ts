/**
 * Color utilities: conversions, naming, harmony analysis, and dominant-color
 * extraction from images. Pure functions except `extractDominantColor`,
 * which needs a browser canvas.
 */

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hexToHsl(hex: string): HSL {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Smallest angular distance between two hues (0-180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Neutrals (black, white, grey, beige, denim-ish desaturated blues) pair with
 * anything, so harmony scoring treats them as universal.
 */
export function isNeutral(hsl: HSL): boolean {
  if (hsl.s <= 14) return true; // greys, black, white
  if (hsl.l >= 92 || hsl.l <= 10) return true; // near white / near black
  // Beiges & tans: low-saturation warm hues
  if (hsl.s <= 32 && hsl.h >= 20 && hsl.h <= 55 && hsl.l >= 55) return true;
  return false;
}

const COLOR_NAMES: { name: string; h: number }[] = [
  { name: "red", h: 0 },
  { name: "orange", h: 30 },
  { name: "yellow", h: 55 },
  { name: "green", h: 110 },
  { name: "teal", h: 170 },
  { name: "blue", h: 220 },
  { name: "purple", h: 275 },
  { name: "pink", h: 330 },
];

/** Best-effort human name for a hex color ("navy", "cream", "olive"...). */
export function nameColor(hex: string): string {
  const hsl = hexToHsl(hex);
  if (hsl.l >= 95) return "white";
  if (hsl.l <= 8) return "black";
  if (hsl.s <= 10) return hsl.l > 60 ? "light grey" : "grey";
  if (isNeutral(hsl)) return hsl.l > 70 ? "cream" : "beige";
  let best = COLOR_NAMES[0];
  for (const c of COLOR_NAMES) {
    if (hueDistance(hsl.h, c.h) < hueDistance(hsl.h, best.h)) best = c;
  }
  if (best.name === "blue" && hsl.l < 30) return "navy";
  if (best.name === "green" && hsl.s < 45 && hsl.l < 45) return "olive";
  if (best.name === "red" && hsl.l < 32) return "burgundy";
  if (hsl.l > 75) return `light ${best.name}`;
  if (hsl.l < 28) return `dark ${best.name}`;
  return best.name;
}

export type HarmonyKind =
  | "neutral"
  | "monochrome"
  | "analogous"
  | "complementary"
  | "triadic"
  | "clash";

export interface HarmonyResult {
  kind: HarmonyKind;
  /** 0-100. >=70 good match, 40-69 okay, <40 clash. */
  score: number;
  label: string;
}

/**
 * Score how well two colors work together in an outfit, using classic
 * color-wheel harmony rules softened for fashion (neutrals always pass).
 */
export function scorePair(hexA: string, hexB: string): HarmonyResult {
  const a = hexToHsl(hexA);
  const b = hexToHsl(hexB);

  if (isNeutral(a) || isNeutral(b)) {
    return { kind: "neutral", score: 88, label: "Neutral pairing" };
  }

  const dist = hueDistance(a.h, b.h);

  if (dist <= 15) {
    // Same hue family — great if lightness differs enough to add contrast.
    const lightnessGap = Math.abs(a.l - b.l);
    return {
      kind: "monochrome",
      score: lightnessGap >= 15 ? 92 : 78,
      label: "Monochrome",
    };
  }
  if (dist <= 45) {
    return { kind: "analogous", score: 85, label: "Analogous" };
  }
  if (dist >= 150) {
    return { kind: "complementary", score: 80, label: "Complementary" };
  }
  if (dist >= 100 && dist < 150) {
    return { kind: "triadic", score: 70, label: "Triadic" };
  }
  // 45-100 degrees apart: awkward zone, worse when both are saturated.
  const saturationPenalty = Math.min(a.s, b.s) > 55 ? 12 : 0;
  return { kind: "clash", score: 42 - saturationPenalty, label: "May clash" };
}

/**
 * Score a whole outfit (0-100) as the weighted average of all pairs,
 * weighting the weakest pair more heavily — one clash ruins an outfit.
 */
export function scoreOutfit(hexes: string[]): number {
  if (hexes.length < 2) return 100;
  const scores: number[] = [];
  for (let i = 0; i < hexes.length; i++) {
    for (let j = i + 1; j < hexes.length; j++) {
      scores.push(scorePair(hexes[i], hexes[j]).score);
    }
  }
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const min = Math.min(...scores);
  return Math.round(avg * 0.6 + min * 0.4);
}

/** Suggested harmony hues to look for, given a base color. */
export function harmonyHues(hex: string): { label: string; h: number }[] {
  const { h } = hexToHsl(hex);
  const wrap = (v: number) => ((v % 360) + 360) % 360;
  return [
    { label: "Analogous", h: wrap(h + 30) },
    { label: "Analogous", h: wrap(h - 30) },
    { label: "Complementary", h: wrap(h + 180) },
    { label: "Triadic", h: wrap(h + 120) },
    { label: "Triadic", h: wrap(h - 120) },
  ];
}

/**
 * Extract a representative dominant color from an image URL by downsampling
 * onto a canvas and averaging the most common quantized bucket. Requires the
 * image host to allow cross-origin reads; callers should catch failures.
 */
export async function extractDominantColor(src: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Image failed to load"));
    el.src = src;
  });

  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Quantize to 32-step buckets and pick the most frequent non-background one.
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Skip near-white pixels — most product photos have white backgrounds.
    if (r > 240 && g > 240 && b > 240) continue;
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best || best.count === 0) throw new Error("No color found");
  return rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count);
}
