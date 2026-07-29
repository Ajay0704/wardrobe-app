/**
 * AJA-248 — outfit hard filters + pairwise scoring ("engine v2").
 *
 * Validated as `public/surprise-proto.js` against the real 154-item closet
 * before being ported here. Behind the `engineV2` store toggle; `matching.ts`
 * routes to it so all six existing callers keep the same API.
 *
 * WHY THIS EXISTS — measured, not asserted. The shipped scorer is statistically
 * indistinguishable from random on a real closet: uniform-random outfits score a
 * median 84 on its own composite and so does `bestLook`, because with the empty
 * options object Surprise me passes, four of six weights are frozen constants
 * and the two that vary are saturated (colour returns a flat 88 on 82.9% of
 * pairs; formality rates 94.6% of pairs "perfect"). Full numbers in AJA-248.
 *
 * Design provenance:
 *  - pairwise scores aggregated over the set, rather than a set-level model:
 *    ACM Comput. Surv. 56(4) Art. 87 §5 (p26) explicitly asks whether
 *    non-pairwise complexity is needed.
 *  - compatibility is per-category-pair, not global: Vasileva et al. type-aware
 *    embeddings (ACM p12-13) and NGNN (node = category, edge = category pair).
 *  - attribute-driven rather than image-driven: TATTOO (arXiv 2509.23242) Table 1
 *    p3 — adding colour+material as text moved FITB 62.40 -> 71.16.
 *  - lightness terms: Ou & Luo, Color Research & Application 31(3), 2006.
 *
 * Values marked TUNE are styling convention, not research findings. No published
 * ordinal garment-formality scale was found.
 *
 * NO GENDER BRANCHING. The ACM survey's ethics section (p26-28) names hard-coded
 * gendered garment rules as a bias failure mode, so this covers the whole
 * vocabulary instead of switching on a gender.
 */
import { SUBCATEGORIES } from "./types";
import type { Category, Season, WardrobeItem } from "./types";

export interface OutfitContext {
  season?: Season | "all";
  tempC?: number | null;
  needsOuterwear?: boolean;
  occasion?: string;
  vibe?: string;
  formality?: string;
}

export interface OutfitSignals {
  colour: number;
  formality: number;
  role: number;
  context: number;
  utility: number;
  style: number;
  balance: number;
}

// ---------------------------------------------------------------------------
// colour: sRGB -> CIELAB, and a harmony score that can actually fail
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

interface Lab { L: number; C: number; h: number }

/** sRGB -> CIELAB (D65). HSL lightness is not perceptual; CIELAB's is. */
export function hexToLab(hex: string): Lab {
  const raw = String(hex || "").replace("#", "").trim();
  const s = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = parseInt(s.slice(0, 6) || "808080", 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  const A = 500 * (fx - fy);
  const Bb = 200 * (fy - fz);
  return {
    L: 116 * fy - 16,
    C: Math.hypot(A, Bb),
    h: (Math.atan2(Bb, A) * 180) / Math.PI,
  };
}

/** Chroma below this reads as neutral (black/white/grey/beige/navy). TUNE. */
const NEUTRAL_CHROMA = 14;

/**
 * Ou & Luo's lightness terms:
 *   HLsum = 0.30 + 0.50*tanh(-4 + 0.029*Lsum)
 *   HdL   = 0.14 + 0.15*tanh(-2 + 0.200*dL)
 * HdL is CONTRAST and is the one that matters for clothing. HLsum is a
 * *brightness preference* — it rates two pale items above a black/white
 * pairing. Summing them equally (a first attempt) scored black+white at 0.30.
 * Caveat: Ou & Luo measured abstract patches on grey, not garments on bodies.
 */
function lightnessHarmony(a: Lab, b: Lab): number {
  const HLsum = 0.3 + 0.5 * Math.tanh(-4 + 0.029 * (a.L + b.L));
  const HdL = 0.14 + 0.15 * Math.tanh(-2 + 0.2 * Math.abs(a.L - b.L));
  const contrast = clamp01((HdL + 0.01) / 0.3); // dL 5→0.12, 10→0.50, 20→0.98
  return clamp01(0.75 * contrast + 0.25 * clamp01(HLsum + 0.2));
}

/** Shortest distance between two hue angles, 0..180. */
function hueDist(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

/** Wheel relationships as a continuous curve. TUNE: band edges are convention. */
function hueHarmony(h1: number, h2: number): number {
  const d = hueDist(h1, h2);
  if (d <= 25) return 0.95;
  if (d <= 50) return 0.85;
  if (d <= 85) return 0.42; // the awkward zone
  if (d <= 115) return 0.62;
  if (d <= 150) return 0.72;
  return 0.88;
}

export interface ColourPair { score: number; kind: string }

/**
 * The shipped `color.ts` scorePair returns a flat 88 whenever EITHER colour is
 * neutral — 82.9% of pairs in the measured closet, i.e. the largest weight is a
 * constant. This does not do that.
 *
 * The two neutral branches MUST span comparable ranges. An earlier version used
 * floors of 0.30 and 0.62, which handed colourful items a ~0.23 systematic bonus:
 * black jeans + white tee scored 0.525 while black jeans + a red football jersey
 * scored 0.707, and jerseys were then chosen at 64% against a 17% base rate.
 */
export function colourPair(hexA: string, hexB: string): ColourPair {
  const A = hexToLab(hexA);
  const B = hexToLab(hexB);
  const light = lightnessHarmony(A, B);
  const nA = A.C < NEUTRAL_CHROMA;
  const nB = B.C < NEUTRAL_CHROMA;

  if (nA && nB) {
    // Contrast is the only information. Black-on-charcoal should fail;
    // black-on-white is one of the best pairings there is.
    return { score: 0.38 + 0.60 * light, kind: "neutral pair" };
  }
  if (nA || nB) {
    return { score: 0.52 + 0.38 * light, kind: "neutral anchor" };
  }
  const hue = hueHarmony(A.h, B.h);
  const bothLoud = A.C > 45 && B.C > 45;
  return {
    score: clamp01((hue * 0.65 + light * 0.35) * (bothLoud ? 0.82 : 1)),
    kind: hue >= 0.8 ? "harmonious" : hue >= 0.6 ? "workable" : "clashing",
  };
}

// ---------------------------------------------------------------------------
// garment roles — keyed on `subcategory` (populated on 153/154 real items).
// Deliberately NOT keyed on `formality`, which is missing on 23 items.
// ---------------------------------------------------------------------------

const sub = (it: WardrobeItem) => String(it.subcategory || "").toLowerCase().trim();
const nm = (it: WardrobeItem) => String(it.name || "").toLowerCase();
const brand = (it: WardrobeItem) => String(it.brand || "").toLowerCase();

/**
 * Dressiness 0..3 for every value in `SUBCATEGORIES` (76 options across 7
 * categories, 16 tagged gender:"female", 2 gender:"male"), plus aliases the
 * model emits. `scripts/test-outfit-rules.mts` asserts 100% coverage by reading
 * SUBCATEGORIES at runtime, so adding a subcategory to the app extends the
 * assertion automatically — the AJA-223/239/244/245 whitelist-drift lesson.
 * TUNE: values are styling convention, not a published scale.
 */
export const SUB_DRESS: Record<string, number> = {
  // top
  tshirt: 0, tee: 0, jersey: 0, tank: 0, hoodie: 0, sweatshirt: 0, zipup: 0,
  crop: 0,
  longsleeve: 1, sweater: 1, knit: 1, cardigan: 1, polo: 1, camisole: 1,
  bodysuit: 1,
  shirt: 2, blouse: 2, buttonup: 2,
  // bottom
  shorts: 0, joggers: 0, sweatpants: 0, leggings: 0, legging: 0, cargo: 0,
  jeans: 1, skirt: 1,
  chinos: 2, trousers: 2, pants: 2, slacks: 2,
  // dress (one-piece)
  sundress: 1, romper: 1, mini: 1,
  midi: 2, maxi: 2, jumpsuit: 2,
  gown: 3,
  // outerwear
  windbreaker: 0, puffer: 0, parka: 0, trackjacket: 0, anorak: 0, raincoat: 0,
  jacket: 1, bomber: 1, denim: 1, leather: 1, vest: 1, overshirt: 1,
  utility: 1, fleece: 1,
  coat: 2, trench: 2, peacoat: 2,
  blazer: 3, suit: 3,
  // shoes
  slides: 0, sandals: 0, sandal: 0, flipflop: 0, sneakers: 0, sneaker: 0,
  trainer: 0,
  espadrilles: 1, flats: 1,
  boots: 2, boot: 2, loafers: 2, loafer: 2, wedges: 2, mule: 2,
  heels: 3, heel: 3, dressshoes: 3, oxford: 3, derby: 3, brogue: 3,
  // bag
  backpack: 0, duffel: 0, beltbag: 0,
  tote: 1, crossbody: 1, messenger: 1, shoulder: 1, bag: 1,
  handbag: 2, satchel: 2,
  clutch: 3,
  // accessory
  cap: 0, beanie: 0, bucket: 0,
  hat: 1, scarf: 1, sunglasses: 1, gloves: 1, wallet: 1, hair: 1,
  bracelet: 1, earrings: 1, necklace: 1,
  belt: 2, watch: 2,
  tie: 3, bowtie: 3, pocketsquare: 3, cufflinks: 3,
};

/** Garments that set an outfit's register. Shoes/bags/accessories excluded. */
export const CORE_CATS = new Set<Category>(["top", "bottom", "dress", "outerwear"]);

/**
 * The BASE outfit, for the dressiness-gap rule. Outerwear is excluded on top of
 * shoes: a layer is meant to sit above the register of what's under it — a
 * blazer over a t-shirt is a normal outfit, and including outerwear rejected it
 * as a "formality clash" at gap 3. Blazer-over-gym-kit is caught by the
 * activewear register rule instead, which is the case that actually reads wrong.
 */
const BASE_CATS = new Set<Category>(["top", "bottom", "dress"]);

/**
 * Activewear is its own register, not a low point on the formality scale — a
 * linear scale cannot express "gym clothes go with gym clothes" (gym tops are
 * d0, jeans d1, so a gap rule waves them through).
 *
 * Deliberately no bare "track" and no bare "legging": 11 items in the measured
 * closet are tagged subcategory=trackjacket while being casual zip-ups
 * ("Pinstripe zip-up jacket"), and leggings + sweater + boots is an ordinary
 * outfit. The subcategory alone is not proof of activewear; a name or brand
 * signal is. "gym" has no \b so "Gymshark" matches.
 */
const GYM_RE =
  /(gymshark|compression|athletic|training|performance|dri-?fit|adizero|running|basketball|\bcurry\b|on ?cloud|jogger|sweatpant|track ?pant|activewear)/;

export const isGym = (it: WardrobeItem): boolean =>
  GYM_RE.test(sub(it)) || GYM_RE.test(nm(it)) || GYM_RE.test(brand(it));

/** Pieces that read street/smart and must not share an outfit with gym kit. */
const SMART_SUBS = new Set([
  "jeans", "chinos", "trousers", "slacks", "shirt", "polo", "blouse",
  "buttonup", "blazer", "suit",
  "gown", "midi", "maxi", "jumpsuit",
  "dressshoes", "oxford", "derby", "brogue", "loafers", "loafer",
  "boots", "boot", "heels", "heel", "wedges",
  "clutch", "handbag", "satchel",
]);

export const isSmartCasual = (it: WardrobeItem): boolean => {
  if (isGym(it)) return false;
  if (SMART_SUBS.has(sub(it))) return true;
  return /(jeans|chino|button-?up|oxford|dress shirt|blazer|chelsea boot|loafer)/.test(nm(it));
};

/**
 * Dressiness, or null when genuinely unknown. Athletic wins outright: the
 * measured closet tags "Gymshark straight leg pumper pants" subcategory=trousers,
 * which would otherwise score 2.
 */
export function dressiness(it: WardrobeItem): number | null {
  if (isGym(it)) return 0;
  // `longsleeve` is ambiguous (tee or button-up). Explicit collar evidence in
  // the name outranks it — the closet has "Greyish-purple long-sleeve button-up
  // shirt" tagged longsleeve.
  if (/(button-?up|button-?down|oxford|dress shirt)/.test(nm(it))) return 2;
  const s = sub(it);
  if (s in SUB_DRESS) return SUB_DRESS[s];
  const hay = `${s} ${nm(it)}`;
  for (const key of Object.keys(SUB_DRESS)) {
    if (hay.includes(key)) return SUB_DRESS[key];
  }
  return null;
}

/**
 * Does this item have a collar? A tie needs one. Tolerates mis-tagging: the
 * closet has "Red Ferrari F1 team polo shirt" tagged subcategory=jersey. A bare
 * /\bshirt\b/ wrongly accepted "compression shirt", so collar evidence must be
 * explicit.
 */
export function isCollared(it: WardrobeItem): boolean {
  const n = nm(it);
  if (/(compression|base ?layer|thermal|rash ?guard|t-?shirt|tee\b|sweat ?shirt|hoodie|turtleneck)/.test(n)) {
    return false;
  }
  if (isGym(it)) return false;
  const s = sub(it);
  if (s === "shirt" || s === "polo" || s === "blouse" || s === "buttonup") return true;
  return /(polo|button-?up|button-?down|oxford|dress shirt|collared|camp collar)/.test(n);
}

const COLD_RE = /(scarf|beanie|glove|mitten|earmuff)/;
export const isColdAccessory = (it: WardrobeItem): boolean =>
  COLD_RE.test(sub(it)) || COLD_RE.test(nm(it));

const isShorts = (it: WardrobeItem) => sub(it) === "shorts" || /\bshorts\b/.test(nm(it));
const itemSeasons = (it: WardrobeItem) => (Array.isArray(it.seasons) ? it.seasons : []);

// ---------------------------------------------------------------------------
// HARD FILTERS — reject, don't penalise. The shipped engine has none of these
// beyond wishlist/has-image.
// ---------------------------------------------------------------------------

/** Null when the outfit is allowed, else a short human-readable reason. */
export function rejectOutfit(items: WardrobeItem[], ctx: OutfitContext = {}): string | null {
  const cats = items.map((i) => i.category);

  // 1. Duplicate garment roles.
  for (const c of ["top", "bottom", "dress", "outerwear", "shoes"] as Category[]) {
    if (cats.filter((x) => x === c).length > 1) return `two ${c} pieces`;
  }
  if (cats.filter((x) => x === "accessory" || x === "bag").length > 2) {
    return "too many accessories";
  }

  // 2. Core coverage + shoes.
  const hasDress = cats.includes("dress");
  const hasTop = cats.includes("top");
  const hasBottom = cats.includes("bottom");
  if (!hasDress && !(hasTop && hasBottom)) return "no complete core";
  if (!cats.includes("shoes")) return "no shoes";
  if (hasDress && (hasTop || hasBottom)) return "dress worn with separates";

  // 3. Role prerequisites. A tie has no `formality` value in the measured closet
  //    and is tagged all four seasons, so neither a formality-gap rule nor a
  //    season gate can catch tie-with-a-jersey. It needs a dependency rule.
  for (const it of items) {
    if (sub(it) === "tie" || /\btie\b/.test(nm(it))) {
      if (!items.some((x) => x.category === "top" && isCollared(x))) {
        return "a tie needs a collared shirt";
      }
    }
  }

  // 4. Dressiness gap over CORE garments only. Including shoes banned every top
  //    above d0, because 16 of 17 shoes in the measured closet are d0 — `shirt`
  //    fell to 0.3% of chosen tops against a 19% base rate, and blazer+sneakers
  //    was rejected outright.
  const coreDr = items
    .filter((i) => BASE_CATS.has(i.category))
    .map(dressiness)
    .filter((d): d is number => d !== null);
  if (coreDr.length >= 2 && Math.max(...coreDr) - Math.min(...coreDr) >= 3) {
    return "formality clash (dressy piece with sportswear)";
  }

  // 5. Activewear as an exclusive register.
  const gym = items.filter(isGym);
  if (gym.length) {
    const smart = items.find(isSmartCasual);
    if (smart) {
      const g = gym.find((x) => x.category === "shoes") ?? gym[0];
      return g.category === "shoes"
        ? `sports shoes (${g.name}) with ${smart.name}`
        : `gym kit (${g.name}) with ${smart.name}`;
    }
  }

  // 6. Athleisure bottoms still don't take a dressy top.
  const athleticBottom = items.find((i) => i.category === "bottom" && isGym(i));
  if (athleticBottom && items.some((i) => i.category === "top" && (dressiness(i) ?? 0) >= 2)) {
    return "dress shirt with athletic bottoms";
  }

  // 7. Shoes get targeted rules rather than a gap: sneakers go with almost
  //    anything, but dress shoes and heels don't belong on gym or beach looks.
  const shoe = items.find((i) => i.category === "shoes");
  if (shoe && (dressiness(shoe) ?? 0) >= 2) {
    const clash = items.find((i) => CORE_CATS.has(i.category) && isGym(i));
    if (clash) return `${shoe.name} with ${clash.name}`;
    if (items.some(isShorts)) return `${shoe.name} with shorts`;
  }
  // And the reverse: a formal one-piece needs shoes to match. Sneakers with a
  // blazer is fine; sneakers with a gown is not. Fires only at dressiness 3.
  const gown = items.find((i) => CORE_CATS.has(i.category) && sub(i) === "gown");
  if (gown && shoe && (dressiness(shoe) ?? 0) <= 0) {
    return `${gown.name} with ${shoe.name}`;
  }

  // 8. Season / weather coherence.
  const season = ctx.season && ctx.season !== "all" ? ctx.season : undefined;
  if (season) {
    for (const it of items) {
      const s = itemSeasons(it);
      // Only reject for the layers that actually read wrong out of season; a
      // spring top in summer is fine.
      if (s.length && !s.includes(season) &&
          (it.category === "accessory" || it.category === "outerwear")) {
        return `${it.name} is not a ${season} piece`;
      }
    }
    if ((season === "summer" || season === "spring") && items.some(isColdAccessory)) {
      return "knit accessory in warm weather";
    }
  }
  if (items.some(isShorts) && items.some(isColdAccessory)) {
    return "knit accessory with shorts";
  }
  if (cats.includes("outerwear") && ctx.needsOuterwear === false &&
      ctx.tempC != null && ctx.tempC >= 22) {
    return "coat in warm weather";
  }
  return null;
}

// ---------------------------------------------------------------------------
// SCORE — pairwise, aggregated over the set
// ---------------------------------------------------------------------------

const FORM_RANK: Record<string, number> = {
  casual: 0, everyday: 0, "smart-casual": 1, smartcasual: 1, business: 1,
  work: 1, statement: 1.5, formal: 2, "black-tie": 3,
};
function formRank(f?: string | null): number | null {
  if (!f) return null;
  const k = String(f).toLowerCase().trim().replace(/\s+/g, "-");
  if (k in FORM_RANK) return FORM_RANK[k];
  if (k.includes("formal")) return 2;
  if (k.includes("smart")) return 1;
  if (k.includes("casual")) return 0;
  return null;
}

/**
 * Per-pair formality. A MISSING value is not scored as perfect (23 items in the
 * measured closet have none), and one step of difference is NORMAL — a shirt
 * with jeans is one of the most standard outfits there is. An earlier curve
 * scored a one-step gap at 0.78, which gave all-casual combinations a systematic
 * edge and dropped shirts to 0.3% of chosen tops.
 */
export function formalityPair(a: WardrobeItem, b: WardrobeItem): number {
  const ra = formRank(a.formality);
  const rb = formRank(b.formality);
  if (ra == null || rb == null) {
    const da = dressiness(a);
    const db = dressiness(b);
    if (da == null || db == null) return 0.6;
    const g = Math.abs(da - db);
    return g === 0 ? 1 : g === 1 ? 0.95 : g === 2 ? 0.5 : 0.15;
  }
  const gap = Math.abs(ra - rb);
  return gap === 0 ? 1 : gap <= 0.5 ? 0.98 : gap <= 1 ? 0.95
    : gap <= 1.5 ? 0.7 : gap <= 2 ? 0.45 : 0.2;
}

/**
 * Proportion, from `fit` (populated on 120/154). The closest this gets to
 * TATTOO's "balance" attribute — worth being humble about: balance is the
 * weakest attribute for every method in that paper's Table 2 (best 0.67).
 * TUNE: entirely convention.
 */
function balanceScore(items: WardrobeItem[]): number {
  const top = items.find((i) => i.category === "top");
  const bottom = items.find((i) => i.category === "bottom");
  if (!top?.fit || !bottom?.fit) return 0.7; // unknown, don't reward or punish
  const volume: Record<string, number> = {
    slim: 0, regular: 1, cropped: 1, relaxed: 2, wide: 3,
  };
  const t = volume[top.fit] ?? 1;
  const b = volume[bottom.fit] ?? 1;
  // Contrast reads deliberate; matching volume at both extremes reads shapeless.
  const d = Math.abs(t - b);
  if (t >= 2 && b >= 2) return 0.5; // volume on volume
  if (d === 0) return 0.75;
  if (d === 1 || d === 2) return 1;
  return 0.85;
}

function contextFit(items: WardrobeItem[], ctx: OutfitContext): number {
  const season = ctx.season && ctx.season !== "all" ? ctx.season : undefined;
  if (!season) return 0.7;
  const tagged = items.filter((i) => itemSeasons(i).length > 0);
  if (!tagged.length) return 0.7;
  const ok = tagged.filter((i) => itemSeasons(i).includes(season)).length;
  let s = 0.35 + 0.65 * (ok / tagged.length);
  const hasCoat = items.some((i) => i.category === "outerwear");
  if (ctx.needsOuterwear && hasCoat) s = Math.min(1, s * 1.12);
  if (ctx.needsOuterwear && !hasCoat) s *= 0.6;
  return clamp01(s);
}

function daysSince(v?: string | number | null): number | null {
  if (v == null || v === "") return null;
  const t = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(String(v));
  if (!isFinite(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

function utilityScore(items: WardrobeItem[]): number {
  let s = 0.6;
  for (const it of items) {
    const w = it.wearCount ?? 0;
    if (w === 0) s += 0.09;
    else if (w <= 2) s += 0.04;
    const d = daysSince(it.lastWornAt);
    if (d != null && d < 4) s -= 0.16;
  }
  return clamp01(s);
}

/**
 * Shared style tags. Normalised by the tag pool, because a raw shared-tag COUNT
 * just rewards items carrying more tags — football jerseys in the measured
 * closet carry 9, which handed them a free 0.11 on this term.
 */
function styleCoherence(items: WardrobeItem[]): number {
  const counts = new Map<string, number>();
  for (const it of items) {
    for (const t of new Set(it.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  }
  if (!counts.size) return 0.6;
  const shared = [...counts.values()].filter((n) => n >= 2).length;
  return clamp01(0.55 + 0.45 * Math.min(1, shared / Math.max(1, counts.size * 0.4)));
}

/** Starting weights. TUNE — must be tuned against real feedback (brief p5). */
export const V2_WEIGHTS = {
  colour: 0.24,
  formality: 0.18,
  role: 0.18,
  context: 0.14,
  utility: 0.09,
  style: 0.09,
  balance: 0.08,
} as const;

export function scoreOutfitV2(
  items: WardrobeItem[],
  ctx: OutfitContext = {},
): { score: number; signals: OutfitSignals } {
  const pairs: [WardrobeItem, WardrobeItem][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) pairs.push([items[i], items[j]]);
  }
  const cols = pairs.map(([a, b]) => colourPair(a.color, b.color).score);
  const forms = pairs.map(([a, b]) => formalityPair(a, b));
  // Worst pair matters more than the average — one clash ruins a look
  // (mirrors color.ts scoreOutfit's avg*0.6 + min*0.4 intent).
  const colour = pairs.length ? 0.6 * mean(cols) + 0.4 * Math.min(...cols) : 0.7;
  const formality = pairs.length ? 0.5 * mean(forms) + 0.5 * Math.min(...forms) : 0.7;

  const dr = items
    .filter((i) => BASE_CATS.has(i.category))
    .map(dressiness)
    .filter((d): d is number => d !== null);
  const gap = dr.length >= 2 ? Math.max(...dr) - Math.min(...dr) : 0;
  const role = gap === 0 ? 1 : gap === 1 ? 0.9 : gap === 2 ? 0.6 : 0.15;

  const signals: OutfitSignals = {
    colour,
    formality,
    role,
    context: contextFit(items, ctx),
    utility: utilityScore(items),
    style: styleCoherence(items),
    balance: balanceScore(items),
  };
  let composite = 0;
  for (const k of Object.keys(V2_WEIGHTS) as (keyof typeof V2_WEIGHTS)[]) {
    composite += V2_WEIGHTS[k] * signals[k];
  }
  return { score: Math.round(clamp01(composite) * 100), signals };
}

/**
 * Similarity for slate diversification. Item-id Jaccard ALONE is not enough:
 * the measured closet holds 16 football jerseys, so three DIFFERENT jerseys
 * score 0% overlap and the slate comes back looking identical while claiming
 * diversity. Garment type and register carry most of the weight.
 */
export function lookSimilarity(a: WardrobeItem[], b: WardrobeItem[]): number {
  const ids = new Set(a.map((i) => i.id));
  let shared = 0;
  for (const i of b) if (ids.has(i.id)) shared++;
  const idSim = shared / Math.max(ids.size, b.length, 1);

  const subA = new Set(a.map(sub).filter(Boolean));
  const subB = new Set(b.map(sub).filter(Boolean));
  let subShared = 0;
  for (const s of subB) if (subA.has(s)) subShared++;
  const subSim = subShared / Math.max(subA.size, subB.size, 1);

  const coreD = (list: WardrobeItem[]) => {
    const ds = list
      .filter((i) => CORE_CATS.has(i.category))
      .map(dressiness)
      .filter((d): d is number => d !== null);
    return ds.length ? mean(ds) : 1;
  };
  const regSim = 1 - Math.min(1, Math.abs(coreD(a) - coreD(b)) / 2);

  return 0.35 * idSim + 0.45 * subSim + 0.2 * regSim;
}

/**
 * One-line "why this", derived from the scorer's own terms so it can't drift
 * from why the look ranked. Shape borrowed from TATTOO's keyword+reason output
 * (p4) — the explanation is a by-product of scoring, not separate prose.
 */
export function explainOutfit(
  items: WardrobeItem[],
  signals: OutfitSignals,
  ctx: OutfitContext = {},
): string[] {
  const out: string[] = [];
  const pairs: [WardrobeItem, WardrobeItem][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) pairs.push([items[i], items[j]]);
  }
  const best = pairs
    .map(([a, b]) => ({ a, b, ...colourPair(a.color, b.color) }))
    .sort((x, y) => y.score - x.score)[0];
  if (best && signals.colour >= 0.62) {
    out.push(`${best.a.colorName || "this"} with ${best.b.colorName || "that"} — ${best.kind}`);
  }
  if (signals.role >= 0.85) {
    const known = items
      .filter((i) => CORE_CATS.has(i.category))
      .map(dressiness)
      .filter((d): d is number => d !== null);
    const lvl = known.length ? Math.round(mean(known)) : 1;
    out.push(`consistently ${["relaxed", "casual", "smart", "dressy"][lvl] ?? "casual"}`);
  }
  const season = ctx.season && ctx.season !== "all" ? ctx.season : undefined;
  if (season && signals.context >= 0.7) {
    out.push(`works for ${season}${ctx.tempC != null ? ` at ${Math.round(ctx.tempC)}°C` : ""}`);
  }
  if (signals.balance >= 0.95) out.push("the proportions balance");
  const forgotten = items.find((i) => (i.wearCount ?? 0) === 0);
  if (forgotten) out.push(`brings back your ${forgotten.name}`);
  return out;
}

/** Every subcategory the app can assign — used by the coverage test. */
export function allAppSubcategories(): { cat: Category; value: string; gender?: string }[] {
  return (Object.keys(SUBCATEGORIES) as Category[]).flatMap((c) =>
    SUBCATEGORIES[c].map((o) => ({ cat: c, value: o.value, gender: o.gender })),
  );
}
