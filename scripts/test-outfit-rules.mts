/**
 * AJA-248 — regression + coverage gate for src/lib/outfit-rules.ts.
 *
 * Run: npm run test:rules
 *
 * Two jobs:
 *  1. VOCABULARY COVERAGE. The dressiness table is hand-written, so it can drift
 *     from the app's own SUBCATEGORIES the way the analyze-attrs whitelist did
 *     (AJA-223/239/244/245). The expected key list is DERIVED from types.ts at
 *     runtime, never retyped — adding a subcategory to the app extends this test
 *     automatically.
 *  2. REGRESSION CASES reported on real outfits: a tie with a jersey, a knit
 *     scarf in summer, gym kit with jeans, sports shoes on casual looks. Plus
 *     over-blocking guards, which matter just as much — a rule that rejects
 *     everything "passes" the first kind of test.
 *
 * Uses synthetic items so it runs with no network and no wardrobe data.
 */
import {
  CORE_CATS,
  SUB_DRESS,
  allAppSubcategories,
  colourPair,
  dressiness,
  formalityPair,
  isCollared,
  isColdAccessory,
  isGym,
  lookSimilarity,
  rejectOutfit,
  scoreOutfitV2,
} from "@/lib/outfit-rules";
import { SUBCATEGORIES } from "@/lib/types";
import type { Category, Season, WardrobeItem } from "@/lib/types";

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

/** Minimal item; only the fields the rules read. */
const it = (p: Partial<WardrobeItem> & { category: Category }): WardrobeItem =>
  ({
    id: p.name ?? Math.random().toString(36).slice(2),
    name: p.name ?? "",
    category: p.category,
    color: p.color ?? "#808080",
    seasons: p.seasons ?? [],
    tags: p.tags ?? [],
    wishlist: false,
    createdAt: new Date().toISOString(),
    ...p,
  }) as WardrobeItem;

const SUMMER = { season: "summer" as Season, tempC: 27, needsOuterwear: false };

// ---------------------------------------------------------------------------
console.log("\n=== 1. Vocabulary coverage (derived from types.ts, not retyped) ===");
const all = allAppSubcategories();
const cats = Object.keys(SUBCATEGORIES) as Category[];
console.log(`  ${all.length} options / ${cats.length} categories · ` +
  `${all.filter((o) => o.gender === "female").length} female-tagged, ` +
  `${all.filter((o) => o.gender === "male").length} male-tagged`);

const unknown = all.filter(
  (o) => dressiness(it({ category: o.cat, subcategory: o.value })) === null,
);
for (const u of unknown) console.log(`     UNKNOWN: ${u.cat}/${u.value}`);
ok(unknown.length === 0, `every app subcategory resolves to a dressiness`,
  unknown.length ? `${unknown.length} unknown` : `${all.length} covered`);
ok(unknown.filter((o) => o.gender === "female").length === 0,
  "no female-tagged subcategory is unknown to the scorer");

// Ordering relationships. Derived comparisons, so absolute values can be tuned
// without rewriting the test.
const d = (v: string, cat: Category) => dressiness(it({ category: cat, subcategory: v }))!;
const rels: [string, boolean][] = [
  ["gown > sundress", d("gown", "dress") > d("sundress", "dress")],
  ["heels > sneakers", d("heels", "shoes") > d("sneakers", "shoes")],
  ["dressshoes > sneakers", d("dressshoes", "shoes") > d("sneakers", "shoes")],
  ["blouse > crop", d("blouse", "top") > d("crop", "top")],
  ["blazer > trackjacket", d("blazer", "outerwear") > d("trackjacket", "outerwear")],
  ["clutch > backpack", d("clutch", "bag") > d("backpack", "bag")],
  ["trousers > joggers", d("trousers", "bottom") > d("joggers", "bottom")],
  ["maxi >= midi", d("maxi", "dress") >= d("midi", "dress")],
];
for (const [label, held] of rels) ok(held, label);

// The app uses plurals for shoes; the model emits either. Both must agree.
for (const [pl, sg] of [["boots", "boot"], ["loafers", "loafer"], ["heels", "heel"], ["sandals", "sandal"], ["sneakers", "sneaker"]]) {
  ok(d(pl, "shoes") === d(sg, "shoes"), `${pl} === ${sg}`, `${d(pl, "shoes")} vs ${d(sg, "shoes")}`);
}
ok(Object.keys(SUB_DRESS).length >= all.length, "table is at least as large as the app vocabulary");
ok(CORE_CATS.has("top") && !CORE_CATS.has("shoes"), "shoes are NOT a core-register garment");

// ---------------------------------------------------------------------------
console.log("\n=== 2. Reported regressions must be rejected ===");
const tee = it({ category: "top", subcategory: "tshirt", name: "Plain tee", color: "#eeeeee", seasons: ["summer"] });
const jersey = it({ category: "top", subcategory: "jersey", name: "United jersey", color: "#cc2222", seasons: ["summer"] });
const jeans = it({ category: "bottom", subcategory: "jeans", name: "Blue jeans", color: "#33507a", seasons: ["summer"] });
const sneakers = it({ category: "shoes", subcategory: "sneakers", name: "White sneakers", color: "#f0f0f0", seasons: ["summer"] });
const tie = it({ category: "accessory", subcategory: "tie", name: "Pink tie", color: "#dd8899", seasons: ["spring", "summer", "fall", "winter"] });
const shirt = it({ category: "top", subcategory: "shirt", name: "Oxford shirt", color: "#f4f4f4", seasons: ["summer"] });
const suitTrousers = it({ category: "bottom", subcategory: "trousers", name: "Suit trousers", color: "#20242c", seasons: ["summer"] });
const dressShoes = it({ category: "shoes", subcategory: "dressshoes", name: "Derby shoes", color: "#2b1d16", seasons: ["summer"] });
const scarf = it({ category: "accessory", subcategory: "scarf", name: "Knit scarf", color: "#c9bda6", seasons: ["fall", "winter"] });
const gymTop = it({ category: "top", subcategory: "tshirt", name: "Gymshark training tee", brand: "Gymshark", color: "#333333", seasons: ["summer"] });
const joggers = it({ category: "bottom", subcategory: "joggers", name: "Joggers", color: "#222222", seasons: ["summer"] });
const runShoe = it({ category: "shoes", subcategory: "sneakers", name: "Nike running shoe", color: "#dddddd", seasons: ["summer"] });
const trainShoe = it({ category: "shoes", subcategory: "sneakers", name: "Nike training shoe", color: "#556b2f", seasons: ["summer"] });

const rejects: [string, WardrobeItem[]][] = [
  ["tie + jersey + jeans", [jersey, jeans, sneakers, tie]],
  ["knit scarf in summer", [tee, jeans, sneakers, scarf]],
  ["gym top + jeans", [gymTop, jeans, sneakers]],
  ["running shoe + jeans", [tee, jeans, runShoe]],
  ["training shoe + jeans", [tee, jeans, trainShoe]],
  ["dress shirt + joggers", [shirt, joggers, sneakers]],
  ["dress shoes + gym kit", [gymTop, joggers, dressShoes]],
  ["no shoes at all", [tee, jeans]],
  ["two tops", [tee, jersey, jeans, sneakers]],
];
for (const [label, outfit] of rejects) {
  const r = rejectOutfit(outfit, SUMMER);
  ok(r !== null, `rejected: ${label}`, r ?? "ALLOWED");
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Over-blocking guards (a rule that rejects everything is useless) ===");
const allows: [string, WardrobeItem[], typeof SUMMER][] = [
  ["ordinary tee + jeans + sneakers", [tee, jeans, sneakers], SUMMER],
  ["shirt + jeans + sneakers", [shirt, jeans, sneakers], SUMMER],
  ["a full gym kit", [gymTop, joggers, runShoe], SUMMER],
  ["tie with a dressy outfit", [shirt, suitTrousers, dressShoes, tie], SUMMER],
  ["knit scarf in winter", [
    it({ category: "top", subcategory: "sweater", name: "Wool jumper", color: "#4a4a4a", seasons: ["winter"] }),
    it({ category: "bottom", subcategory: "jeans", name: "Dark jeans", color: "#2b3a55", seasons: ["winter"] }),
    it({ category: "shoes", subcategory: "boots", name: "Chelsea boots", color: "#2b1d16", seasons: ["winter"] }),
    scarf,
  ], { season: "winter" as Season, tempC: 3, needsOuterwear: true }],
  // Cool context on purpose: at 27C with needsOuterwear:false a blazer is
  // correctly rejected as "coat in warm weather", which says nothing about the
  // formality question this guard is for. (Third time in this issue that a
  // sloppy test context masked the behaviour under test.)
  ["blazer with sneakers", [
    it({ category: "top", subcategory: "tshirt", name: "Plain tee", color: "#eeeeee" }),
    it({ category: "bottom", subcategory: "jeans", name: "Blue jeans", color: "#33507a" }),
    it({ category: "shoes", subcategory: "sneakers", name: "White sneakers", color: "#f0f0f0" }),
    it({ category: "outerwear", subcategory: "blazer", name: "Navy blazer", color: "#242c3a", seasons: ["fall"] }),
  ], { season: "fall" as Season, tempC: 13, needsOuterwear: true }],
  ["leggings + jumper + boots (leggings are not gym-locked)", [
    it({ category: "top", subcategory: "sweater", name: "Wool jumper", color: "#8a7f6d", seasons: ["fall"] }),
    it({ category: "bottom", subcategory: "leggings", name: "Black leggings", color: "#1c1c1c", seasons: ["fall"] }),
    it({ category: "shoes", subcategory: "boots", name: "Ankle boots", color: "#3b2a1f", seasons: ["fall"] }),
  ], { season: "fall" as Season, tempC: 14, needsOuterwear: false }],
  ["midi dress + heels", [
    it({ category: "dress", subcategory: "midi", name: "Midi dress", color: "#3d4a5c", seasons: ["summer"] }),
    it({ category: "shoes", subcategory: "heels", name: "Black heels", color: "#1a1a1a", seasons: ["summer"] }),
  ], SUMMER],
];
for (const [label, outfit, ctx] of allows) {
  const r = rejectOutfit(outfit, ctx);
  ok(r === null, `allowed: ${label}`, r ?? "");
}

// A branded gym legging must still be caught by name even though `leggings`
// alone is not activewear.
ok(isGym(it({ category: "bottom", subcategory: "leggings", name: "Gymshark compression leggings" })),
  "branded gym leggings are still activewear");
ok(!isGym(it({ category: "bottom", subcategory: "leggings", name: "Black leggings" })),
  "plain leggings are not activewear");
ok(!isGym(it({ category: "outerwear", subcategory: "trackjacket", name: "Pinstripe zip-up jacket" })),
  "a trackjacket-tagged casual zip-up is not activewear");
ok(isCollared(it({ category: "top", subcategory: "jersey", name: "Ferrari team polo shirt" })),
  "a mis-tagged polo still counts as collared");
ok(!isCollared(it({ category: "top", subcategory: "longsleeve", name: "White compression shirt" })),
  "a compression shirt does not count as collared");
ok(isColdAccessory(scarf), "a scarf is a cold-weather accessory");

// ---------------------------------------------------------------------------
console.log("\n=== 4. Scoring properties (not magic numbers) ===");
// The bug that made jerseys win: neutral pairs must not be systematically
// punished relative to a loud colour on a neutral.
const nn = colourPair("#1a1a1a", "#f2f2f2").score; // black + white
const cn = colourPair("#1a1a1a", "#c81f2b").score; // black + red jersey
ok(nn > cn, "black+white scores above black+red", `${nn.toFixed(3)} vs ${cn.toFixed(3)}`);
ok(colourPair("#1a1a1a", "#f2f2f2").score > colourPair("#1a1a1a", "#3a3a3a").score,
  "black+white beats black+charcoal (contrast is read)");
ok(colourPair("#c81f2b", "#e8c320").score < 0.6, "two loud clashing hues score low");

// One step of formality is normal; two is not.
const step1 = formalityPair(it({ category: "top", formality: "smart-casual" }), it({ category: "bottom", formality: "casual" }));
const step2 = formalityPair(it({ category: "top", formality: "formal" }), it({ category: "bottom", formality: "casual" }));
ok(step1 > 0.9, "a one-step formality gap is near-neutral", step1.toFixed(2));
ok(step2 < 0.6, "a two-step formality gap is penalised", step2.toFixed(2));
ok(formalityPair(it({ category: "top" }), it({ category: "bottom" })) < 1,
  "a missing formality value is NOT scored as perfect");

// Slate diversity must see garment type, not just item ids — two different
// jerseys are the same outfit.
const jersey2 = it({ category: "top", subcategory: "jersey", name: "Barcelona jersey", color: "#e8c320", seasons: ["summer"] });
const simSameType = lookSimilarity([jersey, jeans, sneakers], [jersey2, jeans, sneakers]);
const simDiffType = lookSimilarity([jersey, jeans, sneakers], [shirt, suitTrousers, dressShoes]);
ok(simSameType > simDiffType, "two jersey looks are more similar than a jersey and a shirt look",
  `${simSameType.toFixed(2)} vs ${simDiffType.toFixed(2)}`);
ok(simSameType > 0.5, "swapping one jersey for another is NOT counted as diverse", simSameType.toFixed(2));

// Scoring returns a sane shape.
const { score, signals } = scoreOutfitV2([shirt, jeans, sneakers], SUMMER);
ok(score >= 0 && score <= 100, "score is 0..100", String(score));
ok(Object.values(signals).every((v) => v >= 0 && v <= 1), "every signal is 0..1");

console.log(`\n${fails === 0 ? "ALL OUTFIT-RULE CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
