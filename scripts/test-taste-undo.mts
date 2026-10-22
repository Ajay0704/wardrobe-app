/**
 * AJA-300 — gate for undoing what the taste loop learned.
 *
 * Run: npm run test:taste-undo
 *
 * Since AJA-299, Colours flags and colour swaps write `badPairs` on their own, and
 * `badPairs` is a HARD filter in the engine: one wrong guess and those two pieces are
 * never suggested together again. Settings → What I've learned lists the pairs and
 * lets you take one back, or reset everything. This suite is the contract for that:
 *
 *  1. removeBadPair takes out exactly one pair, in either argument order.
 *  2. Removing a pair lets the engine suggest it again — it inverts AJA-260's "a pair
 *     marked 'doesn't go' never appears again" — and restores the slates exactly.
 *  3. resetTaste forgets everything, and the slates are today's again.
 *  4. learnedBadPairs resolves the readout: newest first, deleted pieces skipped.
 *
 * "badPairs got shorter" alone would pass while the engine kept the ban, so every
 * undo is measured on the slates.
 *
 * Synthetic two-style closet, so it runs with no network and no wardrobe data.
 */

// taste.ts and the store guard on `typeof window` and persist to localStorage; the
// store's telemetry posts with fetch. Stub all three BEFORE importing anything, so
// every write goes through the real code path instead of the SSR no-op branch.
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
const { learnedBadPairs, readTaste, recordBadPair, recordOutfitFeedback, removeBadPair, resetTaste } =
  await import("@/lib/taste");
const { learnFromFlag } = await import("@/lib/taste-feed");
type WardrobeItem = import("@/lib/types").WardrobeItem;
type TasteState = import("@/lib/taste").TasteState;
type ScoredLook = import("@/lib/matching").ScoredLook;

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

const mk = (
  id: string,
  category: string,
  subcategory: string,
  color: string,
  colorName: string,
  formality: string,
  tags: string[],
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
  }) as WardrobeItem;

/** The two-style closet from test-taste-loop.mts. */
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
const sig = (looks: ScoredLook[]) => looks.map((l) => `${l.itemIds.join(",")}@${l.score}`).join(" / ");
const slates = (taste?: TasteState) =>
  SEEDS.map((s) => sig(suggestLooks(CLOSET, { count: 3, random: rng(s), taste }))).join("\n");

// oxford + grey trousers is the mono staple — AJA-260's bad-pair check uses it too.
const OXFORD = "mono-white-oxford";
const GREY = "mono-grey-trousers";
const KEY = [GREY, OXFORD].join("|"); // sorted, as taste.ts keys it
const hasPair = (l: ScoredLook) => l.itemIds.includes(OXFORD) && l.itemIds.includes(GREY);
const pairRate = (taste?: TasteState) =>
  SEEDS.filter((s) => suggestLooks(CLOSET, { count: 3, random: rng(s), taste }).some(hasPair)).length /
  SEEDS.length;

const reset = () => {
  ls.clear();
  useWardrobe.setState({ items: [...CLOSET], outfits: [], calendar: [] });
};

const baseRate = pairRate();
ok(baseRate >= 0.5, "precondition: oxford + grey trousers is a staple of the baseline slates", pct(baseRate));
const baseSlates = slates();

// ---------------------------------------------------------------------------
console.log("\n=== 1. removeBadPair takes out exactly one pair ===");
reset();
recordBadPair(OXFORD, GREY);
recordBadPair("earthy-rust-tee", "earthy-tan-chinos");
ok(readTaste().badPairs.includes(KEY) && readTaste().badPairs.length === 2, "precondition: two pairs recorded");
// The readout hands back the pieces in display order, not key order, so the argument
// order must not matter.
const after = removeBadPair(OXFORD, GREY);
ok(JSON.stringify(readTaste().badPairs) === JSON.stringify(["earthy-rust-tee|earthy-tan-chinos"]),
  "removing (oxford, grey) takes out the sorted 'grey|oxford' key and nothing else",
  JSON.stringify(readTaste().badPairs));
ok(JSON.stringify(after) === JSON.stringify(readTaste()), "…and returns the state it persisted");
removeBadPair("earthy-tan-chinos", "earthy-rust-tee");
ok(readTaste().badPairs.length === 0, "the reverse argument order removes a pair too");

reset();
recordOutfitFeedback([byId("earthy-olive-tee"), byId("earthy-tan-chinos")], "like");
const liked = JSON.stringify(readTaste());
removeBadPair(OXFORD, GREY);
ok(JSON.stringify(readTaste()) === liked, "removing a pair that isn't there changes nothing");

// ---------------------------------------------------------------------------
console.log("\n=== 2. Removing a pair lets the engine suggest it again ===");
reset();
recordBadPair(OXFORD, GREY);
const banned = pairRate(readTaste());
ok(banned === 0, "precondition: while learned, the pair never appears", `in ${pct(banned)} of slates`);
removeBadPair(OXFORD, GREY);
const back = pairRate(readTaste());
ok(back === baseRate, "after removeBadPair it comes back at exactly the baseline rate",
  `${pct(back)} vs ${pct(baseRate)}`);
// Stronger than the rate: nothing else learned, so the slates must be today's, byte
// for byte. An empty badPairs list that the engine still treated as "taste present"
// would show up here.
ok(slates(readTaste()) === baseSlates, "…and the slates are exactly today's again");

// Through the real feed, with other learning alongside: a Colours flag on the staple
// records a dislike AND the pair. Undoing the pair keeps the dislike, so the slates
// must match a taste with that dislike and no pair — not today's.
reset();
learnFromFlag([byId(OXFORD), byId(GREY)], "colour");
const flagged = readTaste();
ok(flagged.badPairs.includes(KEY) && flagged.dislikedCount === 1,
  "precondition: a Colours flag on oxford + grey trousers records the pair and a dislike");
ok(pairRate(flagged) === 0, "precondition: …and the pair stops appearing");
removeBadPair(GREY, OXFORD);
const undone = readTaste();
ok(undone.dislikedCount === 1 && undone.badPairs.length === 0,
  "removing the pair keeps the look's dislike — only the ban goes");
const dislikeOnly: TasteState = { ...flagged, badPairs: [] };
ok(slates(undone) === slates(dislikeOnly), "…so the slates equal 'that dislike, no pair' exactly");
ok(pairRate(undone) > 0, "…and the pair can be suggested again", `in ${pct(pairRate(undone))} of slates`);

// ---------------------------------------------------------------------------
console.log("\n=== 3. resetTaste forgets everything ===");
reset();
saveEarthyLooks();
learnFromFlag([byId(OXFORD), byId(GREY)], "colour");
const before = readTaste();
ok(before.likedCount > 0 && before.dislikedCount > 0 && before.badPairs.length > 0,
  "precondition: likes, dislikes and a pair are all learned",
  `${before.likedCount} liked, ${before.dislikedCount} disliked, ${before.badPairs.length} pair`);
ok(slates(before) !== baseSlates, "precondition: …and they change the slates");
const cleared = resetTaste();
ok(!ls.has("wardrobe-taste-v1"), "the stored taste is gone, not just zeroed");
ok(cleared.likedCount === 0 && cleared.dislikedCount === 0 && cleared.badPairs.length === 0,
  "resetTaste returns an empty state");
ok(slates(readTaste()) === baseSlates, "after reset the slates are exactly today's");
ok(pairRate(readTaste()) === baseRate, "…including the pair it had learned");
// Learning has to pick up again from zero, not silently stay off.
recordOutfitFeedback([byId("earthy-olive-tee"), byId("earthy-tan-chinos")], "like");
ok(readTaste().likedCount === 1, "feedback after a reset starts counting from one");

// ---------------------------------------------------------------------------
console.log("\n=== 4. The readout: resolved, newest first, deleted pieces skipped ===");
reset();
recordBadPair(GREY, OXFORD);
recordBadPair("earthy-brown-boots", "earthy-rust-tee");
recordBadPair("earthy-blue-jeans", "gone-piece");
const read = learnedBadPairs(readTaste(), CLOSET);
ok(read.length === 2, "a pair naming a deleted piece is skipped", `${read.length} shown of 3 stored`);
ok(read[0]?.map((i) => i.id).join("+") === "earthy-rust-tee+earthy-brown-boots",
  "newest first, and in garment order (top before shoes) rather than id order",
  read.map((p) => p.map((i) => i.id).join("+")).join(", "));
ok(read[1]?.map((i) => i.id).join("+") === "mono-white-oxford+mono-grey-trousers",
  "…then the older pair, top before bottom");
ok(learnedBadPairs(readTaste(), []).length === 0, "an empty closet shows nothing");

console.log(`\n${fails === 0 ? "TASTE UNDO CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);

/** Two saved earthy looks through the real store, so likes are learned the usual way. */
function saveEarthyLooks() {
  const s = useWardrobe.getState();
  s.saveOutfit("Earthy 1", "", ["earthy-olive-tee", "earthy-tan-chinos", "earthy-brown-boots"]);
  s.saveOutfit("Earthy 2", "", ["earthy-rust-tee", "earthy-blue-jeans", "earthy-white-sneakers"]);
}
