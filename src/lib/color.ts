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
  const { r, g, b } = hexToRgb(hex);
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (hsl.l >= 95) return "white";
  // Anything this dark reads as black unless it carries real colour. `l <= 8` alone left
  // #1a1a1a — a black t-shirt — named "grey", because it landed one point above the cut
  // and fell through to the grey branch below (AJA-252). Gated on chroma so a dark but
  // genuinely coloured navy or burgundy still reaches the hue table and gets its own word.
  if (hsl.l <= 12 && chroma <= 24) return "black";
  if (hsl.s <= 10) return hsl.l > 60 ? "light grey" : "grey";
  // Warm hues with little actual colour in them are earth words in English, not
  // "orange": before this, a beige coat was named "light orange" and a brown one
  // "orange" (there is no brown on the hue wheel below). Measured as RGB spread
  // rather than HSL saturation, because saturation inflates at high lightness —
  // cream reads s=47 while being barely coloured at all.
  //
  // Deliberately NOT fixed by widening `isNeutral`: that feeds outfit harmony
  // scoring app-wide, and this is only a question of what to call the colour.
  // The cap is hue-aware. #f3d19e (a pale sand, hue 36) has chroma 85 and was named "light
  // orange" under a flat `<= 84`; raising the cap everywhere would instead drag peach
  // (#f0b79a, hue 20, chroma 86) into "beige", which is worse than what it does now. Sand
  // and tan sit above hue 28; peach and salmon sit below it.
  if (hsl.h >= 18 && hsl.h <= 48 && chroma <= (hsl.h >= 28 ? 92 : 84)) {
    if (hsl.l >= 80) return "cream";
    if (hsl.l >= 70) return "beige";
    if (hsl.l >= 42) return "tan";
    return "brown";
  }
  // Cream and beige are LIGHT words. `isNeutral` also answers true for anything near black
  // (it has an `l <= 10` clause for harmony scoring), so without the lightness guard a very
  // dark navy like #121921 came out "beige" — the worst miss in the closet (AJA-252).
  if (isNeutral(hsl) && hsl.l >= 40) return hsl.l > 70 ? "cream" : "beige";
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
 * The dominant colour of an RGBA byte run: quantize into 32-step buckets, ignore
 * transparent and near-white pixels, and average the fullest bucket.
 *
 * Split out from the canvas version (AJA-243) so the server can share it. The server
 * needs the same answer from `sharp` raw bytes, and two implementations of "what
 * colour is this garment" would drift — which matters because duplicate detection
 * compares a wishlist item's colour against the closet's.
 */
export function dominantFromRgba(
  data: Uint8Array | Uint8ClampedArray | number[],
): string | null {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // transparent — cutouts are mostly this
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Product photos are overwhelmingly white backgrounds; counting them would make
    // every garment "white".
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
  if (!best || best.count === 0) return null;
  return rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count);
}

/**
 * Representative hex per tone word. `parseColor` and `shop_products.tone` both speak
 * this vocabulary, so a shop save can get a real colour with no image work at all.
 */
const TONE_HEX: Record<string, string> = {
  black: "#141414", charcoal: "#3f3f46", grey: "#8a8a80", silver: "#c0c0c4",
  white: "#f6f6f3", ivory: "#f2ede1", cream: "#efe6d3", beige: "#ddd0b8",
  tan: "#c8a678", khaki: "#b7a475", brown: "#6f4a2c", burgundy: "#6d2836",
  red: "#b4342c", coral: "#e2705c", orange: "#d2782f", peach: "#f0b79a",
  yellow: "#d8b234", gold: "#c2a14a", olive: "#5f7a3a", green: "#2f8f4a",
  teal: "#2f6f6b", blue: "#3a5f9a", navy: "#22314f", indigo: "#33417a",
  denim: "#6d8bb5", purple: "#5f4785", pink: "#dd8fa6",
};

/** Tone word -> a usable hex, or null when it isn't a colour word. */
export function toneToHex(tone: string | null | undefined): string | null {
  if (!tone) return null;
  return TONE_HEX[tone.trim().toLowerCase()] ?? null;
}

/**
 * Extract a representative dominant color from an image URL by downsampling onto a
 * canvas. Requires the image host to allow cross-origin reads; callers should catch
 * failures.
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
  const hex = dominantFromRgba(ctx.getImageData(0, 0, size, size).data);
  if (!hex) throw new Error("No color found");
  return hex;
}
