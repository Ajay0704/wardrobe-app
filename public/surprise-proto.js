/*
 * AJA-248 — Surprise me prototype engine. PROTOTYPE ONLY, not app code.
 *
 * Two engines side by side:
 *   currentEngine()  — a faithful port of src/lib/matching.ts as it ships today,
 *                      so the "before" column is the real behaviour and not a
 *                      strawman. Verified against the real module in node
 *                      (scripts note in AJA-248): accessory rate, outerwear
 *                      rate, scarf rate and piece-count distribution all match.
 *   proposedEngine() — hard filters -> weighted pairwise score -> MMR slate.
 *
 * Runs in the browser and in node (see the export shim at the bottom).
 *
 * Every threshold marked TUNE is a starting guess, not a research finding.
 * Provenance for the ones that aren't is cited inline.
 */

// ---------------------------------------------------------------------------
// colour: sRGB -> CIELAB, and a harmony score that can actually fail
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s.slice(0, 6) || "808080", 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** sRGB -> CIELAB (D65). Perceptual space: HSL lightness is not perceptual. */
function hexToLab(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  // D65
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  const L = 116 * fy - 16;
  const A = 500 * (fx - fy);
  const Bb = 200 * (fy - fz);
  return { L, a: A, b: Bb, C: Math.hypot(A, Bb), h: (Math.atan2(Bb, A) * 180) / Math.PI };
}

/** Chroma below this reads as neutral (black/white/grey/beige/navy). TUNE. */
const NEUTRAL_CHROMA = 14;
const isNeutralLab = (lab) => lab.C < NEUTRAL_CHROMA;

/**
 * Ou & Luo (2006), Color Research & Application 31(3) — lightness terms.
 * 1,431 colour pairs, 54 CIELAB colours, 10-point harmony scale.
 *   HLsum = 0.30 + 0.50*tanh(-4 + 0.029*Lsum)
 *   HdL   = 0.14 + 0.15*tanh(-2 + 0.200*dL)
 * This is the piece the shipped scorer has no equivalent of: neutrals still
 * have lightness, and black+white is not the same as black+charcoal.
 * Caveat: Ou & Luo measured abstract patches on grey, not garments on bodies.
 */
function ouLuoLightness(labA, labB) {
  const Lsum = labA.L + labB.L;
  const dL = Math.abs(labA.L - labB.L);
  const HLsum = 0.3 + 0.5 * Math.tanh(-4 + 0.029 * Lsum);
  const HdL = 0.14 + 0.15 * Math.tanh(-2 + 0.2 * dL);

  // HdL is the CONTRAST term and rises with |dL| — that is the one that matters
  // for clothing. HLsum is a *brightness preference*: it rates two pale items
  // above a black/white pairing, which is not a contrast judgment at all.
  // Summing them equally (the first version here) made black+white score 0.30.
  // Contrast leads, brightness is a light modifier.
  const contrast = clamp01((HdL + 0.01) / 0.30); // dL 5→0.12, 10→0.50, 20→0.98
  const brightness = clamp01(HLsum + 0.2);
  return clamp01(0.75 * contrast + 0.25 * brightness);
}

/** Shortest distance between two hue angles, 0..180. */
function hueDist(h1, h2) {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * How well two hues sit together. Classic wheel relationships, but as a
 * continuous curve rather than buckets so it can express "slightly off".
 * TUNE: the band edges are convention (no quantitative source found).
 */
function hueHarmony(h1, h2) {
  const d = hueDist(h1, h2);
  if (d <= 25) return 0.95;               // monochrome / very close
  if (d <= 50) return 0.85;               // analogous
  if (d <= 85) return 0.42;               // the awkward zone
  if (d <= 115) return 0.62;              // loose triadic
  if (d <= 150) return 0.72;              // split complementary
  return 0.88;                            // complementary
}

/**
 * Pair colour score, 0..1. The shipped version returns a flat 88 whenever
 * either colour is neutral, which on the measured closet is 82.9% of pairs —
 * so the largest weight in the score is a constant. This does not do that.
 */
function colourPair(hexA, hexB) {
  const A = hexToLab(hexA);
  const B = hexToLab(hexB);
  const light = ouLuoLightness(A, B);
  const nA = isNeutralLab(A);
  const nB = isNeutralLab(B);

  // The two branches below MUST span comparable ranges. An earlier version used
  // floors of 0.30 (both neutral) and 0.62 (one neutral), which handed every
  // colourful item a ~0.23 systematic bonus: black jeans + white tee scored
  // 0.525 while black jeans + a red football jersey scored 0.707. Result was
  // jerseys chosen at 67% against a 17% base rate. Keep these aligned.
  if (nA && nB) {
    // Both neutral: contrast is the only information. Black-on-charcoal should
    // fail; black-on-white is one of the best pairings there is.
    return { score: 0.40 + 0.52 * light, kind: "neutral pair", light };
  }
  if (nA || nB) {
    // One neutral anchor: safe, but must not out-score a crisp neutral pairing.
    // Span kept wide (0.40) so the term stays discriminating — a narrow 0.26
    // span clustered 29% of all pairs at the mode, i.e. half-inert again.
    return { score: 0.52 + 0.40 * light, kind: "neutral anchor", light };
  }
  // Both chromatic: hue leads, lightness modulates.
  const hue = hueHarmony(A.h, B.h);
  const bothLoud = A.C > 45 && B.C > 45;
  const score = clamp01((hue * 0.65 + light * 0.35) * (bothLoud ? 0.82 : 1));
  return {
    score,
    kind: hue >= 0.8 ? "harmonious" : hue >= 0.6 ? "workable" : "clashing",
    light,
  };
}

// ---------------------------------------------------------------------------
// garment roles — derived from `subcategory`, which is 153/154 populated.
// `formality` is missing on 23 items (incl. the tie), so it cannot be the
// backbone. This is the "attribute x attribute" potential from Liu et al.
// "magic closet" (ACM CSUR 56:4 p5) and the per-category-pair compatibility
// of Vasileva et al. type-aware embeddings (p12-13).
// ---------------------------------------------------------------------------

const sub = (it) => String(it.subcategory || "").toLowerCase().trim();
const nm = (it) => String(it.name || "").toLowerCase();

/**
 * Dressiness 0..3 keyed on subcategory. Deliberately NOT keyed on `formality`.
 * TUNE: these are styling convention, not a published scale — no ordinal
 * garment formality scale was found in the literature.
 */
/*
 * Covers EVERY value in src/lib/types.ts SUBCATEGORIES (87 options across 7
 * categories, 18 of them tagged gender:"female", 2 gender:"male"), plus a few
 * aliases the model emits. The earlier table was invented rather than derived
 * and had singular/plural mismatches — `boot` vs the app's `boots`, `heel` vs
 * `heels`, `loafer` vs `loafers`, `legging` vs `leggings`, and no `dressshoes`
 * at all. Those only worked by accident via the name fallback, and every
 * womenswear subcategory (mini/midi/maxi/gown/jumpsuit/romper/sundress, crop,
 * camisole, bodysuit, flats, wedges, clutch, satchel...) was missing entirely.
 * The verification script asserts 100% coverage against the app's own list, so
 * this can't silently drift again.
 *
 * NOTE: no gender branching anywhere. The ACM survey's ethics section (p26-28)
 * flags hard-coded gendered garment rules as a bias failure mode, so the fix is
 * vocabulary COVERAGE, not a "women's mode".
 */
const SUB_DRESS = {
  // --- top ---
  tshirt: 0, tee: 0, jersey: 0, tank: 0, hoodie: 0, sweatshirt: 0, zipup: 0,
  crop: 0,
  longsleeve: 1, sweater: 1, knit: 1, cardigan: 1, polo: 1, camisole: 1,
  bodysuit: 1,
  shirt: 2, blouse: 2, buttonup: 2,
  // --- bottom ---
  shorts: 0, joggers: 0, sweatpants: 0, leggings: 0, legging: 0, cargo: 0,
  jeans: 1, skirt: 1,
  chinos: 2, trousers: 2, pants: 2, slacks: 2,
  // --- dress (one-piece) ---
  sundress: 1, romper: 1, mini: 1,
  midi: 2, maxi: 2, jumpsuit: 2,
  gown: 3,
  // --- outerwear ---
  windbreaker: 0, puffer: 0, parka: 0, trackjacket: 0, anorak: 0, raincoat: 0,
  jacket: 1, bomber: 1, denim: 1, leather: 1, vest: 1, overshirt: 1,
  utility: 1, fleece: 1,
  coat: 2, trench: 2, peacoat: 2,
  blazer: 3, suit: 3,
  // --- shoes ---
  slides: 0, sandals: 0, sandal: 0, flipflop: 0, sneakers: 0, sneaker: 0,
  trainer: 0,
  espadrilles: 1, flats: 1,
  boots: 2, boot: 2, loafers: 2, loafer: 2, wedges: 2, mule: 2,
  heels: 3, heel: 3, dressshoes: 3, oxford: 3, derby: 3, brogue: 3,
  // --- bag ---
  backpack: 0, duffel: 0, beltbag: 0,
  tote: 1, crossbody: 1, messenger: 1, shoulder: 1, bag: 1,
  handbag: 2, satchel: 2,
  clutch: 3,
  // --- accessory ---
  cap: 0, beanie: 0, bucket: 0,
  hat: 1, scarf: 1, sunglasses: 1, gloves: 1, wallet: 1, hair: 1,
  bracelet: 1, earrings: 1, necklace: 1,
  belt: 2, watch: 2,
  tie: 3, bowtie: 3, pocketsquare: 3, cufflinks: 3,
};

/** Garments that define an outfit's register. Shoes/bags/accessories excluded. */
const CORE_CATS = new Set(["top", "bottom", "dress", "outerwear"]);

/**
 * Dressiness, or null when unknown. Falls back to the name for bad tags.
 * Athletic wins outright: the measured closet tags "Gymshark straight leg
 * pumper pants" as subcategory=trousers, which would otherwise score it 2.
 */
function dressiness(it) {
  if (isAthletic(it)) return 0;
  // `subcategory=longsleeve` is ambiguous (a tee or a button-up). Explicit
  // collar evidence in the name outranks it: the measured closet has
  // "Greyish-purple long-sleeve button-up shirt" tagged longsleeve, scoring 1.
  if (/(button-?up|button-?down|oxford|dress shirt)/.test(nm(it))) return 2;
  const s = sub(it);
  if (s in SUB_DRESS) return SUB_DRESS[s];
  const n = `${s} ${nm(it)}`;
  for (const key of Object.keys(SUB_DRESS)) {
    if (n.includes(key)) return SUB_DRESS[key];
  }
  return null;
}

/**
 * Does this item have a collar? A tie needs one.
 * Tolerates mis-tagging: the measured closet has "Red Ferrari F1 team polo
 * shirt" tagged subcategory=jersey, so the name is consulted too.
 */
function isCollared(it) {
  const n = nm(it);
  // Athletic and knit "shirts" have no collar. A bare /\bshirt\b/ test wrongly
  // accepted "White Gymshark long-sleeve compression shirt" — caught by the
  // verification script's over-blocking check.
  if (/(compression|base ?layer|thermal|rash ?guard|t-?shirt|tee\b|sweat ?shirt|hoodie|turtleneck)/.test(n)) {
    return false;
  }
  if (isAthletic(it)) return false;
  const s = sub(it);
  if (s === "shirt" || s === "polo" || s === "blouse" || s === "buttonup") return true;
  // Explicit collar evidence only — never a bare "shirt".
  return /(polo|button-?up|button-?down|oxford|dress shirt|collared|camp collar)/.test(n);
}

/*
 * ACTIVEWEAR IS ITS OWN REGISTER, not a low point on the formality scale.
 *
 * A linear dressiness scale cannot express "gym clothes go with gym clothes."
 * Gym tops are d0 and jeans are d1, so a gap rule waves them straight through —
 * which is why the prototype paired Gymshark tops with jeans and put running
 * shoes on casual looks.
 *
 * Deliberately no bare "track": 11 items in the measured closet are tagged
 * subcategory=trackjacket while actually being casual zip-ups ("Pinstripe
 * zip-up jacket", "Beige striped zip-up jacket"). Matching "track" would ban
 * them from casual outfits — the over-blocking failure mode.
 *
 * "gym" has no \b so "Gymshark" matches; an earlier \bgym\b missed every one.
 */
// `legging` is deliberately NOT here, for the same reason as bare `track`:
// leggings + sweater + boots is an ordinary outfit, not gym kit. The subcategory
// alone isn't proof of activewear — a name/brand signal is ("Gymshark leggings",
// "compression leggings" still match). Same judgment call as `trackjacket`.
const GYM_RE = /(gymshark|compression|athletic|training|performance|dri-?fit|adizero|running|basketball|\bcurry\b|on ?cloud|jogger|sweatpant|track ?pant|activewear)/;
const isGym = (it) =>
  GYM_RE.test(sub(it)) || GYM_RE.test(nm(it)) || GYM_RE.test(String(it.brand || "").toLowerCase());

/** Kept as the old name for the dressiness fallback; same detector. */
const isAthletic = isGym;

/**
 * Pieces that read as street/smart and therefore must not share an outfit with
 * activewear. Note `trousers` is only "smart" when it isn't gym — the closet
 * tags "Gymshark straight leg pumper pants" as trousers, and isGym wins.
 */
const SMART_SUBS = new Set([
  // bottoms / tops
  "jeans", "chinos", "trousers", "slacks", "shirt", "polo", "blouse",
  "buttonup", "blazer", "suit",
  // one-piece
  "gown", "midi", "maxi", "jumpsuit",
  // shoes — both spellings, since the app uses plurals and the model emits both
  "dressshoes", "oxford", "derby", "brogue", "loafers", "loafer",
  "boots", "boot", "heels", "heel", "wedges",
  // dressy bags: a clutch does not belong on a gym look
  "clutch", "handbag", "satchel",
]);
const isSmartCasual = (it) => {
  if (isGym(it)) return false;
  if (SMART_SUBS.has(sub(it))) return true;
  return /(jeans|chino|button-?up|oxford|dress shirt|blazer|chelsea boot|loafer)/.test(nm(it));
};
const isShorts = (it) => sub(it) === "shorts" || /\bshorts\b/.test(nm(it));

const itemSeasons = (it) => (Array.isArray(it.seasons) ? it.seasons : []);
const COLD = /\b(scarf|beanie|glove|mitten|earmuff)\b/;
const isColdAccessory = (it) => COLD.test(sub(it)) || COLD.test(nm(it));

// ---------------------------------------------------------------------------
// HARD FILTERS — reject, don't penalise. The shipped engine has none of these
// beyond wishlist/has-image. Canvas brief p2: "Hard filters first."
// ---------------------------------------------------------------------------

/**
 * Returns null if the outfit is allowed, else a human-readable reason.
 * Order matters only for which reason surfaces first.
 */
function rejectReason(outfit, ctx) {
  const cats = outfit.map((i) => i.category);

  // 1. Duplicate garment roles (brief p2).
  for (const c of ["top", "bottom", "dress", "outerwear", "shoes"]) {
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

  // 3. Role prerequisites — the shape of rule the tie case needs.
  //    A tie has no `formality` value and is tagged all four seasons, so
  //    neither a formality-gap rule nor a season gate catches it.
  for (const it of outfit) {
    if (sub(it) === "tie" || /\btie\b/.test(nm(it))) {
      if (!outfit.some((x) => x.category === "top" && isCollared(x))) {
        return "a tie needs a collared shirt";
      }
    }
  }

  // 4. Dressiness gap over the CORE garments only — top/bottom/dress/outerwear.
  //    Shoes and accessories are excluded deliberately. 16 of 17 shoes in the
  //    measured closet are dressiness 0, so including them meant every outfit
  //    carried a sneaker and any top above d0 was marked down: `shirt` went from
  //    16.8% of accepted candidates to 0.3% of chosen ones, and blazer+sneakers
  //    was rejected outright. This is the per-category-pair point from
  //    Vasileva et al. — top<->bottom is a real constraint, top<->sneaker is not.
  const coreDr = outfit
    .filter((i) => CORE_CATS.has(i.category))
    .map(dressiness)
    .filter((d) => d !== null);
  if (coreDr.length >= 2) {
    const gap = Math.max(...coreDr) - Math.min(...coreDr);
    if (gap >= 3) return "formality clash (dressy piece with sportswear)";
  }
  // Shoes get targeted rules instead of a gap: sneakers go with almost anything,
  // but dress shoes and heels do not belong on a gym or beach look.
  const shoe = outfit.find((i) => i.category === "shoes");
  if (shoe && (dressiness(shoe) ?? 0) >= 2) {
    const tooCasual = outfit.find(
      (i) => CORE_CATS.has(i.category) && (dressiness(i) ?? 1) === 0 && isGym(i),
    );
    if (tooCasual) return `${shoe.name} with ${tooCasual.name}`;
    if (outfit.some(isShorts)) return `${shoe.name} with shorts`;
  }
  // And the reverse: a formal one-piece needs shoes to match. Sneakers with a
  // blazer is fine; sneakers with a gown is not. Only fires at dressiness 3, so
  // it never touches a midi/sundress worn casually.
  const formalCore = outfit.find(
    (i) => CORE_CATS.has(i.category) && (dressiness(i) ?? 0) >= 3,
  );
  if (formalCore && shoe && (dressiness(shoe) ?? 0) <= 0 && sub(formalCore) === "gown") {
    return `${formalCore.name} with ${shoe.name}`;
  }

  // 5. Activewear is an exclusive register: gym kit pairs with gym kit.
  //    Catches both reported failures — a Gymshark top with jeans, and a
  //    running/training shoe on a casual look. A dressiness gap can't express
  //    this, because gym tops are d0 and jeans d1 (a gap of 1 = "fine").
  const gym = outfit.filter(isGym);
  if (gym.length) {
    const smart = outfit.find(isSmartCasual);
    if (smart) {
      const g = gym.find((x) => x.category === "shoes") ?? gym[0];
      return g.category === "shoes"
        ? `sports shoes (${g.name}) with ${smart.name}`
        : `gym kit (${g.name}) with ${smart.name}`;
    }
  }

  // 6. Athleisure bottoms still don't take a dressy top (e.g. joggers + shirt).
  const athleticBottom = outfit.find((i) => i.category === "bottom" && isGym(i));
  if (athleticBottom) {
    const dressyTop = outfit.find(
      (i) => i.category === "top" && (dressiness(i) ?? 0) >= 2,
    );
    if (dressyTop) return "dress shirt with athletic bottoms";
  }

  // 7. Season / weather coherence.
  if (ctx.season) {
    for (const it of outfit) {
      const s = itemSeasons(it);
      if (s.length && !s.includes(ctx.season)) {
        // Accessories and outerwear are the offenders worth rejecting outright;
        // a spring top in summer is fine.
        if (it.category === "accessory" || it.category === "outerwear") {
          return `${it.name} is not a ${ctx.season} piece`;
        }
      }
    }
    if ((ctx.season === "summer" || ctx.season === "spring") &&
        outfit.some(isColdAccessory)) {
      return "knit accessory in warm weather";
    }
  }
  if (outfit.some(isShorts) && outfit.some(isColdAccessory)) {
    return "knit accessory with shorts";
  }
  // 8. Weather: outerwear only when it's earned (shipped engine: random()<0.45).
  if (cats.includes("outerwear") && ctx.needsOuterwear === false && ctx.tempC != null && ctx.tempC >= 22) {
    return "coat in warm weather";
  }
  return null;
}

// ---------------------------------------------------------------------------
// SCORE — pairwise, aggregated over the set. ACM CSUR 56:4 p26 asks outright
// whether non-pairwise complexity is needed; this takes them at their word.
// ---------------------------------------------------------------------------

const FORM_RANK = {
  casual: 0, everyday: 0, "smart-casual": 1, smartcasual: 1, business: 1,
  work: 1, statement: 1.5, formal: 2, "black-tie": 3,
};
function formRank(f) {
  if (!f) return null;
  const k = String(f).toLowerCase().trim().replace(/\s+/g, "-");
  if (k in FORM_RANK) return FORM_RANK[k];
  if (k.includes("formal")) return 2;
  if (k.includes("smart")) return 1;
  if (k.includes("casual")) return 0;
  return null;
}

/** Per-pair formality, and crucially a MISSING value is not scored as perfect. */
function formalityPair(a, b) {
  const ra = formRank(a.formality);
  const rb = formRank(b.formality);
  if (ra == null || rb == null) {
    // Fall back to subcategory dressiness, which has far fewer holes.
    const da = dressiness(a);
    const db = dressiness(b);
    if (da == null || db == null) return 0.6; // genuinely unknown
    const g = Math.abs(da - db);
    return g === 0 ? 1 : g === 1 ? 0.95 : g === 2 ? 0.5 : 0.15;
  }
  const gap = Math.abs(ra - rb);
  // One step of formality between pieces is NORMAL — a shirt with jeans is one
  // of the most standard outfits there is. An earlier curve scored gap 1 at 0.78,
  // which handed all-casual combinations a systematic edge: jersey+jeans (both
  // tagged casual, gap 0) scored 1.00 while shirt+jeans scored 0.78, and shirts
  // fell to 0.3% of chosen tops against a 19% base rate. Two steps is where it
  // actually starts to read wrong.
  // Shipped code scores gap<=1 as 1.00, which rates dress-shirt+joggers IDEAL —
  // that end still has to bite, hence the sharp drop past 1.5.
  return gap === 0 ? 1 : gap <= 0.5 ? 0.98 : gap <= 1 ? 0.95 : gap <= 1.5 ? 0.7 : gap <= 2 ? 0.45 : 0.2;
}

function contextFit(outfit, ctx) {
  if (!ctx.season) return 0.7;
  const tagged = outfit.filter((i) => itemSeasons(i).length > 0);
  if (!tagged.length) return 0.7;
  const ok = tagged.filter((i) => itemSeasons(i).includes(ctx.season)).length;
  let s = 0.35 + 0.65 * (ok / tagged.length);
  const hasCoat = outfit.some((i) => i.category === "outerwear");
  if (ctx.needsOuterwear && hasCoat) s = Math.min(1, s * 1.12);
  if (ctx.needsOuterwear && !hasCoat) s *= 0.6;
  return clamp01(s);
}

function utility(outfit) {
  // Underused pieces get a lift (brief p3), recently-worn a mild penalty.
  let s = 0.6;
  for (const it of outfit) {
    const w = it.wearCount ?? 0;
    if (w === 0) s += 0.09;
    else if (w <= 2) s += 0.04;
    const d = daysSince(it.lastWornAt);
    if (d != null && d < 4) s -= 0.16;
  }
  return clamp01(s);
}

function daysSince(iso) {
  if (!iso) return null;
  const t = typeof iso === "number" ? iso * (iso < 1e12 ? 1000 : 1) : Date.parse(iso);
  if (!isFinite(t)) return null;
  return (Date.now() - t) / 86400000;
}

function styleCoherence(outfit) {
  // Shared tags across pieces = a coherent register. "Fashion style
  // consistency" (ACM CSUR p16): pieces can look different yet share a style.
  //
  // Normalised by the tag pool, because a raw shared-tag COUNT just rewards
  // items that happen to carry more tags. Football jerseys in this closet carry
  // 9 tags (sporty, casual, athletic, branded, football, streetwear, ...) while
  // shirts carry a different set, so the unnormalised version handed jerseys a
  // free 0.11 on this term.
  const counts = new Map();
  for (const it of outfit) {
    for (const t of new Set(it.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  }
  if (!counts.size) return 0.6;
  const shared = [...counts.values()].filter((n) => n >= 2).length;
  const pool = counts.size;
  return clamp01(0.55 + 0.45 * Math.min(1, shared / Math.max(1, pool * 0.4)));
}

/** Weights are starting guesses. Brief p5 step 6: tune from feedback. TUNE. */
const W = {
  colour: 0.25,
  formality: 0.20,
  role: 0.20,
  context: 0.15,
  utility: 0.10,
  style: 0.10,
};

function scoreOutfit(outfit, ctx) {
  // pairwise colour + formality, aggregated by mean and worst-case
  const pairs = [];
  for (let i = 0; i < outfit.length; i++) {
    for (let j = i + 1; j < outfit.length; j++) pairs.push([outfit[i], outfit[j]]);
  }
  const cols = pairs.map(([a, b]) => colourPair(a.color, b.color).score);
  const forms = pairs.map(([a, b]) => formalityPair(a, b));
  // Worst pair matters more than the average — one clash ruins a look.
  const colour = pairs.length ? 0.6 * mean(cols) + 0.4 * Math.min(...cols) : 0.7;
  const formality = pairs.length ? 0.5 * mean(forms) + 0.5 * Math.min(...forms) : 0.7;

  // Same restriction as the hard filter: score the gap across core garments
  // only. Including shoes made the ranker reject every top above dressiness 0,
  // because this closet's shoe pool is 16/17 sneakers.
  const dr = outfit
    .filter((i) => CORE_CATS.has(i.category))
    .map(dressiness)
    .filter((d) => d !== null);
  const gap = dr.length >= 2 ? Math.max(...dr) - Math.min(...dr) : 0;
  const role = gap === 0 ? 1 : gap === 1 ? 0.9 : gap === 2 ? 0.6 : 0.15;

  const signals = {
    colour,
    formality,
    role,
    context: contextFit(outfit, ctx),
    utility: utility(outfit),
    style: styleCoherence(outfit),
  };
  let composite = 0;
  for (const k of Object.keys(W)) composite += W[k] * signals[k];
  return { score: Math.round(clamp01(composite) * 100), signals };
}

// ---------------------------------------------------------------------------
// explanation — derived from the scorer's own terms, in TATTOO's keyword+reason
// shape (arXiv 2509.23242 p4), so it can't drift from why the look ranked.
// ---------------------------------------------------------------------------

function explain(outfit, signals, ctx) {
  const out = [];
  const pairs = [];
  for (let i = 0; i < outfit.length; i++)
    for (let j = i + 1; j < outfit.length; j++) pairs.push([outfit[i], outfit[j]]);
  const best = pairs
    .map(([a, b]) => ({ a, b, ...colourPair(a.color, b.color) }))
    .sort((x, y) => y.score - x.score)[0];
  if (best && signals.colour >= 0.62) {
    const an = best.a.colorName || "this";
    const bn = best.b.colorName || "that";
    out.push({ k: "Colour", why: `${an} with ${bn} — ${best.kind}` });
  }
  if (signals.role >= 0.85) {
    const known = outfit.map(dressiness).filter((d) => d !== null);
    const lvl = known.length ? Math.round(mean(known)) : 1;
    out.push({ k: "Register", why: `consistently ${["relaxed", "casual", "smart", "dressy"][lvl] || "casual"}` });
  }
  if (ctx.season && signals.context >= 0.7) {
    out.push({ k: "Season", why: `works for ${ctx.season}${ctx.tempC != null ? ` at ${ctx.tempC}°C` : ""}` });
  }
  const forgotten = outfit.find((i) => (i.wearCount ?? 0) === 0);
  if (forgotten) out.push({ k: "Utility", why: `brings back your ${forgotten.name}` });
  else {
    const stale = outfit.find((i) => (daysSince(i.lastWornAt) ?? 0) > 21);
    if (stale) out.push({ k: "Utility", why: `you haven't worn ${stale.name} in a while` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// candidate generation + MMR slate
// ---------------------------------------------------------------------------

function buildCandidates(pool, ctx, rnd, tries) {
  const byCat = {};
  for (const it of pool) (byCat[it.category] ||= []).push(it);
  const pick = (cat) => {
    const list = byCat[cat] || [];
    return list.length ? list[Math.floor(rnd() * list.length)] : null;
  };
  const out = [];
  const seen = new Set();
  for (let t = 0; t < tries; t++) {
    const o = [];
    const useDress = (byCat.dress || []).length && rnd() < 0.2;
    if (useDress) { const d = pick("dress"); if (d) o.push(d); }
    else {
      const a = pick("top"); const b = pick("bottom");
      if (a) o.push(a); if (b) o.push(b);
    }
    const sh = pick("shoes"); if (sh) o.push(sh);
    // Outerwear only when the weather earns it (or a coin-flip in cold seasons).
    if (ctx.needsOuterwear || ((ctx.season === "winter" || ctx.season === "fall") && rnd() < 0.5)) {
      const ow = pick("outerwear"); if (ow) o.push(ow);
    }
    // Accessories are opt-in and rarer than the shipped 70%.
    if (rnd() < 0.3) {
      const ac = rnd() < 0.5 ? pick("accessory") : pick("bag");
      if (ac) o.push(ac);
    }
    if (o.length < 2) continue;
    const key = o.map((i) => i.id).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const why = rejectReason(o, ctx);
    if (why) { out.push({ items: o, rejected: why }); continue; }
    const { score, signals } = scoreOutfit(o, ctx);
    out.push({ items: o, score, signals, reasons: explain(o, signals, ctx) });
  }
  return out;
}

/**
 * Similarity MMR penalises. Item-id Jaccard ALONE is not enough: this closet
 * holds 16 football jerseys, so three different jerseys score 0% overlap and
 * the slate comes back looking identical while claiming to be diverse. That is
 * both why jerseys monopolised every slot and why the three looks felt samey.
 * Garment TYPE and register carry most of the weight instead.
 */
function lookSim(a, b) {
  const ids = new Set(a.items.map((i) => i.id));
  let shared = 0;
  for (const i of b.items) if (ids.has(i.id)) shared++;
  const idSim = shared / Math.max(ids.size, b.items.length, 1);

  // Garment-type profile: two jersey+jeans+sneaker looks are the same outfit.
  const subA = new Set(a.items.map(sub).filter(Boolean));
  const subB = new Set(b.items.map(sub).filter(Boolean));
  let subShared = 0;
  for (const s of subB) if (subA.has(s)) subShared++;
  const subSim = subShared / Math.max(subA.size, subB.size, 1);

  // Register: a smart look and a relaxed look are meaningfully different even
  // when they happen to share a garment type.
  const coreD = (look) => {
    const ds = look.items
      .filter((i) => CORE_CATS.has(i.category))
      .map(dressiness)
      .filter((d) => d !== null);
    return ds.length ? mean(ds) : 1;
  };
  const regSim = 1 - Math.min(1, Math.abs(coreD(a) - coreD(b)) / 2);

  return 0.35 * idSim + 0.45 * subSim + 0.20 * regSim;
}

/**
 * Slate of three by MMR at three different lambdas, so the looks differ along
 * a CONTROLLED axis. Canvas brief p3: "A random shuffle is not a surprise
 * feature; it should be constrained novelty."
 *   MMR = argmax [ lambda*Rel(i) - (1-lambda)*max_{j in S} Sim(i,j) ]
 * Lambda bands from practitioner guidance (Elastic, Agrawal): 0.7-0.9
 * precision, 0.3-0.5 discovery.
 */
const SLATE = [
  { label: "Safe", lambda: 0.85, blurb: "your usual, done well" },
  { label: "Elevated", lambda: 0.55, blurb: "a sharper version" },
  { label: "Experimental", lambda: 0.35, blurb: "a combination you haven't tried" },
];

function mmrSlate(cands) {
  const ok = cands.filter((c) => !c.rejected).sort((a, b) => b.score - a.score);
  if (!ok.length) return [];
  const maxScore = ok[0].score || 1;
  const chosen = [];
  for (const slot of SLATE) {
    let best = null;
    let bestVal = -Infinity;
    for (const c of ok) {
      if (chosen.includes(c)) continue;
      const rel = c.score / maxScore;
      const sim = chosen.length ? Math.max(...chosen.map((s) => lookSim(c, s))) : 0;
      const val = slot.lambda * rel - (1 - slot.lambda) * sim;
      if (val > bestVal) { bestVal = val; best = c; }
    }
    if (best) chosen.push(Object.assign(best, { slot: slot.label, blurb: slot.blurb }));
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// the CURRENT engine, ported faithfully from src/lib/matching.ts
// (verified against the real module in node: see AJA-248)
// ---------------------------------------------------------------------------

/** Exact transcription of src/lib/color.ts scorePair (verified against source). */
function legacyScorePair(hexA, hexB) {
  const a = hexToHsl(hexA);
  const b = hexToHsl(hexB);
  if (legacyIsNeutral(a) || legacyIsNeutral(b)) return 88; // the flat constant
  const dist = hueDist(a.h, b.h);
  if (dist <= 15) return Math.abs(a.l - b.l) >= 15 ? 92 : 78;
  if (dist <= 45) return 85;
  if (dist >= 150) return 80;
  if (dist >= 100 && dist < 150) return 70;
  return 42 - (Math.min(a.s, b.s) > 55 ? 12 : 0);
}

/** src/lib/color.ts scoreOutfit — avg*0.6 + min*0.4, one clash ruins it. */
function legacyScoreOutfit(hexes) {
  if (hexes.length < 2) return 100;
  const ss = [];
  for (let i = 0; i < hexes.length; i++)
    for (let j = i + 1; j < hexes.length; j++) ss.push(legacyScorePair(hexes[i], hexes[j]));
  return Math.round(mean(ss) * 0.6 + Math.min(...ss) * 0.4);
}
function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (mx === R) h = ((G - B) / d) % 6;
    else if (mx === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}
/** Exact transcription of src/lib/color.ts isNeutral — note the beige/tan clause,
 *  which my first attempt omitted and which is why 58% of this closet is neutral. */
function legacyIsNeutral(hsl) {
  if (hsl.s <= 14) return true;                 // greys, black, white
  if (hsl.l >= 92 || hsl.l <= 10) return true;  // near white / near black
  if (hsl.s <= 32 && hsl.h >= 20 && hsl.h <= 55 && hsl.l >= 55) return true; // beiges & tans
  return false;
}

function currentEngine(pool, rnd, candidates = 18) {
  const looks = [];
  for (let n = 0; n < candidates; n++) {
    const picked = [];
    const place = (it) => { if (it && !picked.some((p) => p.id === it.id)) picked.push(it); };
    const weightOf = (it) => {
      let harmony = 0.8;
      if (picked.length) harmony = Math.min(...picked.map((p) => legacyScorePair(p.color, it.color))) / 100;
      let fresh = 1;
      const d = daysSince(it.lastWornAt);
      if (d != null && d < 3) fresh = 0.15 + (d / 3) * 0.35;
      else if ((it.wearCount ?? 0) === 0) fresh = 1.15;
      else if ((it.wearCount ?? 0) <= 2) fresh = 1.05;
      return Math.max(0.01, harmony * harmony * 0.5 * fresh);
    };
    const fill = (cats) => {
      const c = pool.filter((it) => cats.includes(it.category) && !picked.some((p) => p.id === it.id));
      if (!c.length) return;
      const ws = c.map((it) => ({ v: it, w: weightOf(it) }));
      const total = ws.reduce((s, x) => s + Math.max(x.w, 0.01), 0);
      let roll = rnd() * total;
      for (const x of ws) { roll -= Math.max(x.w, 0.01); if (roll <= 0) { place(x.v); return; } }
      place(ws[ws.length - 1].v);
    };
    const dressesAvail = pool.some((i) => i.category === "dress");
    if (dressesAvail && rnd() < 0.28) fill(["dress"]);
    else { fill(["top"]); fill(["bottom"]); }
    fill(["shoes"]);
    if (rnd() < 0.45) fill(["outerwear"]);
    if (rnd() < 0.7) fill(["accessory", "bag"]);
    if (picked.length < 2) continue;
    looks.push({ items: picked, score: legacyComposite(picked) });
  }
  looks.sort((a, b) => b.score - a.score);
  return looks[0] || null;
}

function legacyComposite(items) {
  // matching.ts scoreLook: color = scoreOutfit(hexes)/100 when >=2 items, else 0.7
  const colour = items.length >= 2 ? legacyScoreOutfit(items.map((i) => i.color)) / 100 : 0.7;
  const ranks = items.map((i) => formRank(i.formality)).filter((r) => r != null);
  const spread = ranks.length >= 2 ? Math.max(...ranks) - Math.min(...ranks) : 0;
  const formality = ranks.length < 2 ? 0.7 : spread <= 1 ? 1 : spread <= 1.5 ? 0.7 : 0.35;
  let anti = 0.7;
  let boosts = 0;
  for (const it of items) {
    const d = daysSince(it.lastWornAt);
    if (d != null && d < 3) anti -= 0.18;
    else if ((it.wearCount ?? 0) === 0) { anti += 0.08; boosts++; }
    else if ((it.wearCount ?? 0) <= 2) anti += 0.04;
  }
  if (boosts >= 1) anti += 0.05; // matching.ts:335, omitted in the first port
  anti = clamp01(anti);
  let c = 0.05 * 0.55 + 0.28 * colour + 0.22 * formality + 0.18 * 0.7 + 0.14 * 0.65 + 0.13 * anti;
  c = c * 0.92 + 0.5 * 0.08;
  if (items.some((i) => i.category === "shoes")) c += 0.03;
  const hasCore = items.some((i) => i.category === "dress") ||
    (items.some((i) => i.category === "top") && items.some((i) => i.category === "bottom"));
  if (!hasCore) c *= 0.5;
  return Math.round(clamp01(c) * 100);
}

// ---------------------------------------------------------------------------
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function mean(xs) { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Proposed engine entry point: candidate pool -> filters -> score -> slate. */
function proposedEngine(pool, ctx, rnd, tries = 400) {
  const cands = buildCandidates(pool, ctx, rnd, tries);
  return { slate: mmrSlate(cands), candidates: cands };
}

const API = {
  proposedEngine, currentEngine, buildCandidates, mmrSlate, scoreOutfit,
  rejectReason, colourPair, formalityPair, dressiness, isCollared, isColdAccessory,
  hexToLab, ouLuoLightness, mulberry32, explain, SLATE, W, SUB_DRESS,
};
if (typeof module !== "undefined" && module.exports) module.exports = API;
if (typeof window !== "undefined") window.SurpriseProto = API;
