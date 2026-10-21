/**
 * Smart Buy regression + v2 behavior checks.
 *
 * Run: npm run test:smart-buy
 *
 * Revived for AJA-301: this lived as an unrun `.ts` that crashed on its first line (it
 * looked up an "Emerald" demo dress the starter closet no longer has), so nothing guarded
 * the redundancy heuristic AJA-301 changes. Same assertions, current fixtures, and the
 * suite's usual PASS/FAIL report so one break doesn't hide the rest.
 */
import { analyzeSmartBuy, projectedAnnualWears } from "@/lib/smart-buy";
import { demoItems } from "@/lib/demo-data";
type WardrobeItem = import("@/lib/types").WardrobeItem;

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

function item(
  partial: Partial<WardrobeItem> & Pick<WardrobeItem, "name" | "category" | "color">,
): WardrobeItem {
  return {
    id: partial.id ?? `t-${Math.random().toString(36).slice(2, 8)}`,
    imageUrl: partial.imageUrl ?? "",
    tags: partial.tags ?? [],
    seasons: partial.seasons ?? [],
    wishlist: partial.wishlist ?? false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  } as WardrobeItem;
}

console.log("\n=== 1. Baseline on the starter closet ===");
const dress = demoItems.find((i) => i.id === "demo-w-black-dress");
ok(!!dress, "precondition: the starter closet has its priced dress");
if (dress) {
  const r1 = analyzeSmartBuy(dress, demoItems);
  ok(["buy", "maybe", "skip"].includes(r1.verdict), "verdict is valid", r1.verdict);
  ok(r1.costPerWear !== null && r1.costPerWear > 0, "a priced piece gets a cost per wear", String(r1.costPerWear));
  ok(r1.cpwBasis === "category-average" || r1.cpwBasis === "closet-history", "cpwBasis set", r1.cpwBasis);
}

console.log("\n=== 2. Empty closet ===");
const lonely = item({ name: "Solo Top", category: "top", color: "#2244aa", wishlist: true, price: 80, tags: ["work"] });
const r2 = analyzeSmartBuy(lonely, [lonely]);
ok(r2.pairsWith.length === 0, "empty closet → no pairs");
ok(r2.reasons.some((x) => /gap/i.test(x.text)), "empty closet mentions the gap");
ok(r2.cpwBasis === "category-average", "no wear history → category-average CPW");

console.log("\n=== 3. Redundancy (the AJA-301 surface) ===");
const navy1 = item({ name: "Navy Tee A", category: "top", color: "#1e3a5f", tags: ["casual"], wearCount: 20 });
const navy2 = item({ name: "Navy Tee B", category: "top", color: "#1c3558", wishlist: true, price: 40, tags: ["casual"] });
const r3 = analyzeSmartBuy(navy2, [navy1, navy2]);
ok(r3.redundant.length >= 1, "near-duplicate colour is flagged", `${r3.redundant.length}`);
ok(r3.verdict === "skip" || r3.verdict === "maybe", "redundant leans skip/maybe", r3.verdict);

const workA = item({ name: "Charcoal Work Shirt", category: "top", color: "#3a3a3a", tags: ["work", "minimal", "formal"] });
const workB = item({ name: "Slate Work Shirt", category: "top", color: "#5a5a5a", wishlist: true, price: 65, tags: ["work", "minimal", "formal"] });
ok(analyzeSmartBuy(workB, [workA, workB]).redundant.length >= 1, "shared tags mark same-role redundancy");

console.log("\n=== 4. Wear-history cost per wear ===");
const proj = projectedAnnualWears("top", [
  item({ name: "A", category: "top", color: "#111", wearCount: 30 }),
  item({ name: "B", category: "top", color: "#222", wearCount: 20 }),
]);
ok(proj.basis === "closet-history", "projectedAnnualWears uses closet history");
ok(proj.wears === 25, "average wears is 25", String(proj.wears));
const wornCloset = [
  item({ name: "Worn Top", category: "top", color: "#eee", wearCount: 30, tags: ["work"] }),
  item({ name: "Wish Top", category: "top", color: "#333", wishlist: true, price: 50, tags: ["work"] }),
];
const rCpw = analyzeSmartBuy(wornCloset[1], wornCloset);
ok(rCpw.cpwBasis === "closet-history", "analyze uses closet history when wears exist");
ok(rCpw.annualWears === 30, "annual wears from history = 30", String(rCpw.annualWears));
ok(rCpw.reasons.some((x) => /how often you wear/i.test(x.text)), "CPW reason mentions closet history");

console.log("\n=== 5. Pairing rules ===");
const formalBlouse = item({ name: "Silk Blouse", category: "top", color: "#111111", tags: ["formal", "work"], seasons: ["spring", "fall"] });
const gymShorts = item({ name: "Gym Shorts", category: "bottom", color: "#222222", tags: ["athleisure"], seasons: ["spring", "summer"] });
const wishFormal = item({ name: "Wish Formal Top", category: "top", color: "#0a0a0a", wishlist: true, price: 90, tags: ["formal", "work"], seasons: ["spring", "fall"] });
ok(!analyzeSmartBuy(wishFormal, [formalBlouse, gymShorts, wishFormal]).pairsWith.some((p) => p.item.name === "Gym Shorts"),
  "formal wish does not pair with athleisure-only bottoms");

const winterCoat = item({ name: "Parka", category: "outerwear", color: "#1a1a1a", tags: ["casual"], seasons: ["winter"] });
const summerDress = item({ name: "Wish Sundress", category: "dress", color: "#f5d0c0", wishlist: true, price: 70, tags: ["casual"], seasons: ["summer"] });
ok(!analyzeSmartBuy(summerDress, [winterCoat, summerDress]).pairsWith.some((p) => p.item.name === "Parka"),
  "summer dress does not pair with winter-only outerwear");

const creamTop = item({ name: "Cream Top", category: "top", color: "#f5f0e6", tags: ["minimal", "work"], seasons: ["spring"], wearCount: 12 });
const navyBottom = item({ name: "Navy Trousers", category: "bottom", color: "#2e3a4e", tags: ["minimal", "work"], seasons: ["spring"], wearCount: 15 });
const wishMin = item({ name: "Minimal Shirt", category: "top", color: "#ffffff", wishlist: true, price: 55, tags: ["minimal", "work"], seasons: ["spring"] });
const rVibe = analyzeSmartBuy(wishMin, [creamTop, navyBottom, wishMin], { styleVibes: ["minimal", "work"] });
ok(rVibe.reasons.some((x) => /style profile/i.test(x.text)), "style vibes produce a profile reason");
ok(rVibe.pairsWith.length >= 1, "vibe closet pairs ≥1", String(rVibe.pairsWith.length));

console.log("\n=== 6. Subcategory gate (AJA-301) ===");
// The heuristic said a black tee and a black hoodie were the same purchase: same
// category, similar colour. Every item carries an inferred subcategory, and two
// different garment types are never "very similar" however close the colour is.
const blackTee = item({ name: "Black Tee", category: "top", subcategory: "tshirt", color: "#151515", tags: ["casual", "minimal"] });
const blackHoodie = item({ name: "Black Hoodie", category: "top", subcategory: "hoodie", color: "#141414", wishlist: true, price: 70, tags: ["casual", "minimal"] });
ok(analyzeSmartBuy(blackHoodie, [blackTee, blackHoodie]).redundant.length === 0,
  "a hoodie is not a duplicate of a tee in the same colour and tags");
const blackTee2 = item({ name: "Another Black Tee", category: "top", subcategory: "tshirt", color: "#161616", wishlist: true, price: 30 });
ok(analyzeSmartBuy(blackTee2, [blackTee, blackTee2]).redundant.length === 1,
  "positive control: two tees in the same colour are still flagged");

console.log(`\n${fails === 0 ? "SMART BUY CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
