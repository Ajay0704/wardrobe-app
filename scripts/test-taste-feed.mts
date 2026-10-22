/**
 * AJA-299 — gate for the everyday feeds into the taste loop.
 *
 * Run: npm run test:taste-feed
 *
 * AJA-260 made the engine READ taste (scripts/test-taste-loop.mts is that contract).
 * But the only thing that ever WROTE it was the stylist's thumbs, and nothing ever
 * passed a mismatched pair, so for anyone who never opens the stylist the loop was
 * dormant and `badPairs` was always empty. This suite is the contract for the feeds:
 *
 *  1. SAVE → like, through the real store's `saveOutfit`.
 *  2. WEAR → like, through the real store's `logWear`, resolving pieces from the store.
 *  3. FLAG → dislike — except "weather", which is about the day, not your taste.
 *  4. A "Colours" flag names a bad pair, but only when one pair clearly stands out.
 *  5. A swap read as "colour" names the pair it fixed, but only when unambiguous.
 *  6. The lib surfaces that build looks (Rediscover, Explore) actually honour taste.
 *
 * Every feed has to MOVE something measurable — the top pick for likes/dislikes, the
 * slate for bad pairs. "taste.likedCount went up" alone would pass while the engine
 * ignored it, which is precisely how AJA-260 sat broken.
 *
 * Synthetic closets, so it runs with no network and no wardrobe data.
 */

// taste.ts and the store guard on `typeof window` and persist to localStorage; the
// store's telemetry posts with fetch. Stub all three BEFORE importing anything, so
// feedback goes through the real code paths instead of the SSR no-op branches.
const ls = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.window = g;
g.localStorage = {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => void ls.set(k, v),
  removeItem: (k: string) => void ls.delete(k),
  get length() {
    return ls.size;
  },
  key: (i: number) => [...ls.keys()][i] ?? null,
};
g.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });

const { useWardrobe } = await import("@/lib/store");
const { suggestLooks } = await import("@/lib/matching");
const { readTaste } = await import("@/lib/taste");
const { clearColourClash, colourSwapCulprit, learnFromColourSwap, learnFromFlag } = await import(
  "@/lib/taste-feed"
);
const { styleWays } = await import("@/lib/rediscover");
// Explicit extension: src/lib/explore/ is also a directory, and reshook resolves the
// bare path to it first.
const { buildClosetLooks } = await import("@/lib/explore.ts");
type WardrobeItem = import("@/lib/types").WardrobeItem;
type TasteState = import("@/lib/taste").TasteState;
type ScoredLook = import("@/lib/matching").ScoredLook;

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const S = () => useWardrobe.getState();

const mk = (
  id: string,
  category: string,
  subcategory: string,
  color: string,
  colorName: string,
  formality: string,
  tags: string[],
  extra: Partial<WardrobeItem> = {},
): WardrobeItem =>
  ({
    id,
    name: id,
    category,
    subcategory,
    color,
    colorName,
    tone: colorName,
    formality,
    tags,
    seasons: [],
    wishlist: false,
    imageUrl: `https://example.test/${id}.png`,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  }) as WardrobeItem;

/** The two-style closet from test-taste-loop.mts: mono out-scores earthy by ~4 points. */
const EARTHY = [
  mk("earthy-olive-tee", "top", "tshirt", "#6b7a3a", "olive", "casual", ["casual"]),
  mk("earthy-rust-tee", "top", "tshirt", "#b5532c", "rust", "casual", ["casual"]),
  mk("earthy-tan-chinos", "bottom", "chinos", "#c8a96e", "tan", "casual", ["casual"]),
  mk("earthy-blue-jeans", "bottom", "jeans", "#3b5b85", "blue", "casual", ["casual"]),
  mk("earthy-brown-boots", "shoes", "boots", "#5a3a22", "brown", "casual", ["casual"]),
  mk("earthy-white-sneakers", "shoes", "sneakers", "#f2f2f2", "white", "casual", ["casual"]),
];
const MONO = [
  mk("mono-white-oxford", "top", "shirt", "#f4f4f4", "white", "smart-casual", ["work", "minimal"]),
  mk("mono-black-polo", "top", "polo", "#1a1a1a", "black", "smart-casual", ["work", "minimal"]),
  mk("mono-black-trousers", "bottom", "trousers", "#151515", "black", "smart-casual", ["work", "minimal"]),
  mk("mono-grey-trousers", "bottom", "trousers", "#7a7a7a", "grey", "smart-casual", ["work", "minimal"]),
  mk("mono-black-loafers", "shoes", "loafers", "#111111", "black", "smart-casual", ["work", "minimal"]),
  mk("mono-black-dressshoes", "shoes", "dressshoes", "#0d0d0d", "black", "formal", ["work", "minimal"]),
];
const CLOSET = [...EARTHY, ...MONO];
const byId = (id: string) => CLOSET.find((i) => i.id === id)!;

/** Seeded LCG — the engine samples, so every rate is over the same 60 draws. */
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i);
const isEarthy = (l: ScoredLook) =>
  l.items.filter((i) => i.id.startsWith("earthy-")).length / l.items.length > 0.5;
const earthyLeads = (taste?: TasteState) => {
  const tops = SEEDS.map((s) => suggestLooks(CLOSET, { count: 1, random: rng(s), taste })[0]).filter(Boolean);
  return tops.filter(isEarthy).length / tops.length;
};
const topPicks = (closet: WardrobeItem[], taste?: TasteState) =>
  SEEDS.map((s) => suggestLooks(closet, { count: 1, random: rng(s), taste })[0]?.itemIds.join(",")).join(" / ");

/** Clean slate: no taste, and the store holding exactly `items`. */
const reset = (items: WardrobeItem[] = CLOSET) => {
  ls.clear();
  useWardrobe.setState({ items: [...items], outfits: [], calendar: [] });
};

// A real engine look of each pure style, so feedback lands on things the engine makes.
const pool = suggestLooks(CLOSET, { count: 60, candidates: 60, random: rng(1) });
const earthyLook = pool.find((l) => l.items.every((i) => i.id.startsWith("earthy-")))!;
const monoLooks = pool.filter((l) => l.items.every((i) => i.id.startsWith("mono-"))).slice(0, 3);
ok(!!earthyLook && monoLooks.length === 3, "precondition: the engine makes pure looks of both styles");
const base = earthyLeads();
// Without this every "→ earthy leads" below would be pushing on an open door.
ok(base <= 0.1, "precondition: with no feedback the engine leads with monochrome", `earthy leads ${pct(base)}`);

// ---------------------------------------------------------------------------
console.log("\n=== 1. Saving a look is a like ===");
reset();
S().saveOutfit("Earthy", "", earthyLook.itemIds);
ok(readTaste().likedCount === 1, "saveOutfit records one like", `likedCount ${readTaste().likedCount}`);
const afterSave = earthyLeads(readTaste());
ok(afterSave >= 0.9, "ONE saved earthy look → earthy leads", `earthy leads ${pct(afterSave)}`);

reset();
S().saveOutfit("Just a tee", "", ["earthy-olive-tee"]);
ok(readTaste().likedCount === 0, "a one-piece save is not a look, and teaches nothing");

// Old accounts still hold the drawn starter closet. Those aren't your clothes, so a
// look saved from them says nothing about what you wear.
const SAMPLES = [
  mk("demo-men-rust-tee", "top", "tshirt", "#b5532c", "rust", "casual", ["casual"]),
  mk("demo-men-tan-chinos", "bottom", "chinos", "#c8a96e", "tan", "casual", ["casual"]),
];
reset([...CLOSET, ...SAMPLES]);
S().saveOutfit("Samples", "", SAMPLES.map((i) => i.id));
ok(readTaste().likedCount === 0, "a look made of starter samples teaches nothing");

// ---------------------------------------------------------------------------
console.log("\n=== 2. Wearing a look is a like ===");
reset();
S().logWear({ itemIds: earthyLook.itemIds });
ok(readTaste().likedCount === 1, "logWear records one like, resolving pieces from the store");
const afterWear = earthyLeads(readTaste());
ok(afterWear >= 0.9, "ONE worn earthy look → earthy leads", `earthy leads ${pct(afterWear)}`);

reset();
S().logWear({ itemIds: ["earthy-olive-tee"] });
ok(readTaste().likedCount === 0, "one loose garment marked worn (ItemCard) is not a look");

// A styled wish piece can be logged as part of a look, but you can't have worn it.
const WISH = mk("wish-mustard-overshirt", "outerwear", "overshirt", "#d4a017", "mustard", "casual", ["casual"], {
  wishlist: true,
});
reset([...CLOSET, WISH]);
S().logWear({ itemIds: ["earthy-olive-tee", "earthy-tan-chinos"] });
const ownedOnly = readTaste();
reset([...CLOSET, WISH]);
S().logWear({ itemIds: [WISH.id, "earthy-olive-tee", "earthy-tan-chinos"] });
ok(JSON.stringify(readTaste()) === JSON.stringify(ownedOnly),
  "a wish piece in a worn look is dropped — the like is exactly the owned pieces'");
reset([...CLOSET, WISH]);
S().logWear({ itemIds: [WISH.id, "earthy-olive-tee"] });
ok(readTaste().likedCount === 0, "a wish piece plus one real garment is not a worn look");

// ---------------------------------------------------------------------------
console.log("\n=== 3. Flagging a look is a dislike — unless it was the weather ===");
reset();
monoLooks.forEach((l) => learnFromFlag(l.items, "not_it"));
const afterFlags = earthyLeads(readTaste());
ok(readTaste().dislikedCount === 3, "three 'just not it' flags record three dislikes");
ok(afterFlags >= 0.9, "three flagged monochrome looks → monochrome stops leading", `earthy leads ${pct(afterFlags)}`);

for (const reason of ["too_dressy", "too_casual", "colour"] as const) {
  reset();
  learnFromFlag(monoLooks[0].items, reason);
  ok(readTaste().dislikedCount === 1, `a '${reason}' flag is a dislike`);
}

// "Wrong for the weather" is about today, not you. Learning it as a dislike would
// teach "you don't like wool" in July and quietly bury your winter coat in January.
reset();
const baseTops = topPicks(CLOSET);
monoLooks.forEach((l) => learnFromFlag(l.items, "weather"));
ok(readTaste().dislikedCount === 0 && readTaste().likedCount === 0, "a 'weather' flag records nothing");
ok(topPicks(CLOSET, readTaste()) === baseTops, "…so after three weather flags the slates are exactly today's");

// ---------------------------------------------------------------------------
console.log("\n=== 4. A 'Colours' flag blames a pair only when one clearly stands out ===");
// Hand-checked colourPair scores: rust/olive 0.29 (clashing), rust/black and
// olive/black 0.81 — one pair is obviously the problem.
const RUST = byId("earthy-rust-tee");
const OLIVE_CHINOS = mk("olive-chinos", "bottom", "chinos", "#6b7a3a", "olive", "casual", ["casual"]);
const BLACK_BOOTS = mk("black-boots", "shoes", "boots", "#111111", "black", "casual", ["casual"]);
const clash = clearColourClash([RUST, OLIVE_CHINOS, BLACK_BOOTS]);
ok(clash?.map((i) => i.id).sort().join("|") === "earthy-rust-tee|olive-chinos",
  "rust tee + olive chinos + black boots → the rust/olive pair", clash?.map((i) => i.id).join(" + ") ?? "none");

// pink/tan 0.33 and pink/orange 0.34: the TOP is the problem, not one pairing. Naming
// either pair would ban a combination the user never objected to.
const PINK = mk("pink-tee", "top", "tshirt", "#e88aa8", "pink", "casual", ["casual"]);
const TAN = mk("tan-chinos", "bottom", "chinos", "#c8a96e", "tan", "casual", ["casual"]);
const ORANGE = mk("orange-sneakers", "shoes", "sneakers", "#e67e22", "orange", "casual", ["casual"]);
ok(clearColourClash([PINK, TAN, ORANGE]) === null, "pink clashing with BOTH others → no single pair to blame");

const DRESS = mk("red-dress", "dress", "midi", "#c0392b", "red", "casual", ["casual"]);
const PURPLE_HEELS = mk("purple-heels", "shoes", "heels", "#7d3c98", "purple", "casual", ["casual"]);
const two = clearColourClash([DRESS, PURPLE_HEELS]);
ok(two?.length === 2, "a two-piece look has one pair, so a colour complaint is about it");

reset();
const flagged = learnFromFlag([RUST, OLIVE_CHINOS, BLACK_BOOTS], "colour");
// Returned so the canvas can name the pair: a ban the user can't see can't be noticed
// when it's wrong.
ok(flagged?.map((i) => i.id).sort().join("|") === "earthy-rust-tee|olive-chinos",
  "learnFromFlag returns the pair it blamed, for the toast");
ok(JSON.stringify(readTaste().badPairs) === JSON.stringify(["earthy-rust-tee|olive-chinos"]),
  "a 'Colours' flag on that look records the pair (sorted key, as taste.ts reads it)", JSON.stringify(readTaste().badPairs));
ok(readTaste().dislikedCount === 1, "…and still counts as a dislike of the look");

reset();
const unnamed = learnFromFlag([PINK, TAN, ORANGE], "colour");
ok(unnamed === null && readTaste().badPairs.length === 0 && readTaste().dislikedCount === 1,
  "an ambiguous 'Colours' flag is a dislike with no pair");

reset();
learnFromFlag([RUST, OLIVE_CHINOS, BLACK_BOOTS], "not_it");
ok(readTaste().badPairs.length === 0, "only a colour complaint names a pair — 'just not it' doesn't");

// ---------------------------------------------------------------------------
console.log("\n=== 5. A swap read as 'colour' blames the pair it fixed ===");
const WHITE_TEE = mk("white-tee", "top", "tshirt", "#f4f4f4", "white", "casual", ["casual"]);
// rust→white lifts the olive pairing 0.29→0.86 (+0.57) and the black one 0.81→0.85 (+0.04).
const culprit = colourSwapCulprit(RUST, WHITE_TEE, [OLIVE_CHINOS, BLACK_BOOTS]);
ok(culprit?.id === "olive-chinos", "rust → white with olive chinos + black boots → the olive chinos",
  culprit?.id ?? "none");
// pink→white lifts tan +0.55 and orange +0.54: it fixed the top against everything.
ok(colourSwapCulprit(PINK, WHITE_TEE, [TAN, ORANGE]) === null, "a swap that fixed every pairing equally blames none");
// The two signals have to agree. rust→tan lifts grey sneakers most (+0.27) but rust's
// worst partner was the green jeans (0.44 vs 0.55). Blaming either is a guess.
const TAN_TEE = mk("tan-tee", "top", "tshirt", "#c8a96e", "tan", "casual", ["casual"]);
const GREEN_JEANS = mk("green-jeans", "bottom", "jeans", "#2e8b57", "green", "casual", ["casual"]);
const GREY_SNEAKERS = mk("grey-sneakers", "shoes", "sneakers", "#7a7a7a", "grey", "casual", ["casual"]);
ok(colourSwapCulprit(RUST, TAN_TEE, [GREEN_JEANS, GREY_SNEAKERS]) === null,
  "biggest improvement ≠ worst clash → no blame");

reset();
const blamed = learnFromColourSwap(RUST, WHITE_TEE, [OLIVE_CHINOS, BLACK_BOOTS]);
ok(blamed?.id === "olive-chinos", "learnFromColourSwap returns the piece it blamed, for the toast", blamed?.id ?? "none");
ok(JSON.stringify(readTaste().badPairs) === JSON.stringify(["earthy-rust-tee|olive-chinos"]),
  "…and records the pair", JSON.stringify(readTaste().badPairs));
// You fixed the look rather than throwing it away — that's engagement, not rejection.
ok(readTaste().dislikedCount === 0 && readTaste().likedCount === 0,
  "…and nothing else: a fixed look is not a disliked one");

// End to end, on a closet where the swap happens on a look the engine keeps making:
// mustard tee + red jeans turn up in every baseline slate. Swapping the tee for white
// is read as colour (inferSwapReason) and blames the jeans (mustard/red 0.68 → white/red
// 0.86; the blue boots don't move).
const SWAP_CLOSET = [
  mk("mustard-tee", "top", "tshirt", "#d4a017", "mustard", "casual", ["casual"]),
  mk("white-tee2", "top", "tshirt", "#f4f4f4", "white", "casual", ["casual"]),
  mk("brown-sweater", "top", "sweater", "#5a3a22", "brown", "casual", ["casual"]),
  mk("orange-chinos", "bottom", "chinos", "#e67e22", "orange", "casual", ["casual"]),
  mk("red-jeans", "bottom", "jeans", "#c0392b", "red", "casual", ["casual"]),
  mk("black-sneakers", "shoes", "sneakers", "#111111", "black", "casual", ["casual"]),
  mk("blue-boots", "shoes", "boots", "#3b5b85", "blue", "casual", ["casual"]),
];
const sw = (id: string) => SWAP_CLOSET.find((i) => i.id === id)!;
const { inferSwapReason } = await import("@/lib/engine-feedback");
const rest = [sw("red-jeans"), sw("blue-boots")];
ok(inferSwapReason(sw("mustard-tee"), sw("white-tee2"), rest) === "colour",
  "precondition: the engine-feedback inference reads this swap as colour");
const PAIR = ["mustard-tee", "red-jeans"];
const pairRate = (taste?: TasteState) =>
  SEEDS.filter((s) =>
    suggestLooks(SWAP_CLOSET, { count: 3, random: rng(s), taste }).some((l) => PAIR.every((id) => l.itemIds.includes(id))),
  ).length / SEEDS.length;
const pairBefore = pairRate();
ok(pairBefore >= 0.5, "precondition: mustard tee + red jeans is a staple of the slates", pct(pairBefore));
// Where it lives matters. The lead look is the colour-safest one the engine has, so a
// colour swap almost never happens there: in 1,500 random closets I found none. A bad
// pair learned from a swap therefore moves the Experimental look, not the top pick —
// asserted, so nobody later "fixes" this test by hunting for a lead-look case.
const slot3 = (taste?: TasteState) =>
  SEEDS.map((s) => suggestLooks(SWAP_CLOSET, { count: 3, random: rng(s), taste })[2]?.itemIds.join(",")).join(" / ");
const leadHasPair = SEEDS.some((s) =>
  PAIR.every((id) => suggestLooks(SWAP_CLOSET, { count: 1, random: rng(s) })[0].itemIds.includes(id)),
);
ok(!leadHasPair, "precondition: the pair rides in the Experimental slot, never the lead");
const slot3Before = slot3();
const leadBefore = topPicks(SWAP_CLOSET);
reset(SWAP_CLOSET);
learnFromColourSwap(sw("mustard-tee"), sw("white-tee2"), rest);
const pairAfter = pairRate(readTaste());
ok(pairAfter === 0, "after ONE colour swap that pair never comes back", `in ${pct(pairAfter)} of slates`);
ok(slot3(readTaste()) !== slot3Before, "…so the Experimental look the engine offers changes");
ok(topPicks(SWAP_CLOSET, readTaste()) === leadBefore, "…and the lead look, which never had it, is left alone");

// ---------------------------------------------------------------------------
console.log("\n=== 6. The lib surfaces honour taste ===");
// oxford + grey trousers is the mono staple. Rediscover anchors ONE of them, so the
// bad-pair filter must still apply (it exempts only a pair you pinned both halves of).
const STAPLE = ["mono-grey-trousers", "mono-white-oxford"];
const hasStaple = (ids: string[]) => STAPLE.every((id) => ids.includes(id));
const ANCHOR = byId("mono-white-oxford");
const rediscoverRate = () => {
  let hits = 0;
  for (let i = 0; i < 30; i++) if (styleWays(ANCHOR, CLOSET, 3).some((w) => hasStaple(w.itemIds))) hits++;
  return hits / 30;
};
const exploreRate = () => {
  let hits = 0;
  for (let i = 0; i < 30; i++) if (buildClosetLooks(CLOSET, undefined, 8).some((p) => hasStaple(p.itemIds ?? []))) hits++;
  return hits / 30;
};
reset();
const rdBefore = rediscoverRate();
const exBefore = exploreRate();
ok(rdBefore >= 0.5 && exBefore >= 0.5, "precondition: both surfaces offer oxford + grey trousers",
  `rediscover ${pct(rdBefore)}, explore ${pct(exBefore)}`);
reset();
learnFromFlag([ANCHOR, byId("mono-grey-trousers")], "colour");
const rdAfter = rediscoverRate();
const exAfter = exploreRate();
ok(rdAfter === 0, "Rediscover (styleWays) never offers a pair you flagged", `in ${pct(rdAfter)} of runs`);
ok(exAfter === 0, "Explore (buildClosetLooks) never offers a pair you flagged", `in ${pct(exAfter)} of runs`);

console.log(`\n${fails === 0 ? "TASTE FEED CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
