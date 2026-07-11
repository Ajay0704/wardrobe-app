/**
 * Smart Buy regression + v2 behavior checks.
 * Run: npx tsx scripts/test-smart-buy.ts
 */
import {
  analyzeSmartBuy,
  projectedAnnualWears,
} from "../src/lib/smart-buy";
import { demoItems } from "../src/lib/demo-data";
import type { WardrobeItem } from "../src/lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK  ${msg}`);
}

function item(
  partial: Partial<WardrobeItem> & Pick<WardrobeItem, "name" | "category" | "color">,
): WardrobeItem {
  return {
    id: partial.id ?? `t-${Math.random().toString(36).slice(2, 8)}`,
    imageUrl: partial.imageUrl ?? "",
    tags: partial.tags ?? [],
    seasons: partial.seasons ?? [],
    wishlist: partial.wishlist ?? false,
    createdAt: Date.now(),
    ...partial,
  };
}

console.log("\n=== Smart Buy tests (v2) ===\n");

// --- Regression from baseline ---
const dress = demoItems.find((i) => i.name.includes("Emerald"))!;
const r1 = analyzeSmartBuy(dress, demoItems);
assert(r1.pairsWith.length >= 0, `demo dress runs (verdict=${r1.verdict}, pairs=${r1.pairsWith.length})`);
assert(r1.costPerWear !== null && r1.costPerWear > 0, `demo dress has CPW ${r1.costPerWear}`);
assert(["buy", "maybe", "skip"].includes(r1.verdict), `verdict is valid: ${r1.verdict}`);
assert(
  r1.cpwBasis === "category-average" || r1.cpwBasis === "closet-history",
  `cpwBasis set: ${r1.cpwBasis}`,
);

const lonely = item({
  name: "Solo Top",
  category: "top",
  color: "#2244aa",
  wishlist: true,
  price: 80,
  tags: ["work"],
});
const r2 = analyzeSmartBuy(lonely, [lonely]);
assert(r2.pairsWith.length === 0, "empty closet → no pairs");
assert(r2.reasons.some((x) => /gap/i.test(x.text)), "empty closet mentions gap");
assert(r2.cpwBasis === "category-average", "no wear history → category-average CPW");

const navy1 = item({
  name: "Navy Tee A",
  category: "top",
  color: "#1e3a5f",
  tags: ["casual"],
  wearCount: 20,
});
const navy2 = item({
  name: "Navy Tee B",
  category: "top",
  color: "#1c3558",
  wishlist: true,
  price: 40,
  tags: ["casual"],
});
const r3 = analyzeSmartBuy(navy2, [navy1, navy2]);
assert(r3.redundant.length >= 1, `near-duplicate flagged (${r3.redundant.length})`);
assert(r3.verdict === "skip" || r3.verdict === "maybe", `redundant leans skip/maybe: ${r3.verdict}`);

// --- v2: wear-history CPW ---
const proj = projectedAnnualWears("top", [
  item({ name: "A", category: "top", color: "#111", wearCount: 30 }),
  item({ name: "B", category: "top", color: "#222", wearCount: 20 }),
]);
assert(proj.basis === "closet-history", "projectedAnnualWears uses closet-history");
assert(proj.wears === 25, `avg wears 25 (got ${proj.wears})`);

const wornCloset = [
  item({
    name: "Worn Top",
    category: "top",
    color: "#eee",
    wearCount: 30,
    tags: ["work"],
  }),
  item({
    name: "Wish Top",
    category: "top",
    color: "#333",
    wishlist: true,
    price: 50,
    tags: ["work"],
  }),
];
const rCpw = analyzeSmartBuy(wornCloset[1], wornCloset);
assert(rCpw.cpwBasis === "closet-history", "analyze uses closet-history when wears exist");
assert(rCpw.annualWears === 30, `annual wears from history = 30 (got ${rCpw.annualWears})`);
assert(
  rCpw.reasons.some((x) => /how often you wear/i.test(x.text)),
  "CPW reason mentions closet history",
);

// --- v2: formal vs athleisure clash ---
const formalBlouse = item({
  name: "Silk Blouse",
  category: "top",
  color: "#111111",
  tags: ["formal", "work"],
  seasons: ["spring", "fall"],
});
const gymShorts = item({
  name: "Gym Shorts",
  category: "bottom",
  color: "#222222",
  tags: ["athleisure"],
  seasons: ["spring", "summer"],
});
const wishFormal = item({
  name: "Wish Formal Top",
  category: "top",
  color: "#0a0a0a",
  wishlist: true,
  price: 90,
  tags: ["formal", "work"],
  seasons: ["spring", "fall"],
});
const rClash = analyzeSmartBuy(wishFormal, [formalBlouse, gymShorts, wishFormal]);
assert(
  !rClash.pairsWith.some((p) => p.item.name === "Gym Shorts"),
  "formal wishlist does not pair with athleisure-only bottoms",
);

// --- v2: season mismatch excluded ---
const winterCoat = item({
  name: "Parka",
  category: "outerwear",
  color: "#1a1a1a",
  tags: ["casual"],
  seasons: ["winter"],
});
const summerDress = item({
  name: "Wish Sundress",
  category: "dress",
  color: "#f5d0c0",
  wishlist: true,
  price: 70,
  tags: ["casual"],
  seasons: ["summer"],
});
const rSeason = analyzeSmartBuy(summerDress, [winterCoat, summerDress]);
assert(
  !rSeason.pairsWith.some((p) => p.item.name === "Parka"),
  "summer dress does not pair with winter-only outerwear",
);

// --- v2: style vibes boost ---
const creamTop = item({
  name: "Cream Top",
  category: "top",
  color: "#f5f0e6",
  tags: ["minimal", "work"],
  seasons: ["spring"],
  wearCount: 12,
});
const navyBottom = item({
  name: "Navy Trousers",
  category: "bottom",
  color: "#2e3a4e",
  tags: ["minimal", "work"],
  seasons: ["spring"],
  wearCount: 15,
});
const wishMin = item({
  name: "Minimal Shirt",
  category: "top",
  color: "#ffffff",
  wishlist: true,
  price: 55,
  tags: ["minimal", "work"],
  seasons: ["spring"],
});
const rVibe = analyzeSmartBuy(wishMin, [creamTop, navyBottom, wishMin], {
  styleVibes: ["minimal", "work"],
});
assert(
  rVibe.reasons.some((x) => /style profile/i.test(x.text)),
  "style vibes produce profile reason",
);
assert(rVibe.pairsWith.length >= 1, `vibe closet pairs ≥1 (got ${rVibe.pairsWith.length})`);

// --- v2: tag redundancy without identical hue ---
const workA = item({
  name: "Charcoal Work Shirt",
  category: "top",
  color: "#3a3a3a",
  tags: ["work", "minimal", "formal"],
});
const workB = item({
  name: "Slate Work Shirt",
  category: "top",
  color: "#5a5a5a",
  wishlist: true,
  price: 65,
  tags: ["work", "minimal", "formal"],
});
const rTagRed = analyzeSmartBuy(workB, [workA, workB]);
assert(
  rTagRed.redundant.length >= 1,
  `shared tags mark same-role redundancy (${rTagRed.redundant.length})`,
);

console.log("\nAll Smart Buy tests passed.\n");
