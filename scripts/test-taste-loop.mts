/**
 * AJA-260 — gate for the like/dislike taste loop in src/lib/matching.ts.
 *
 * Run: npm run test:taste
 *
 * `recordOutfitFeedback` has written liked/disliked style vectors and `badPairs` to
 * localStorage since AJA-38, and the v2 engine never read any of it: the stylist's
 * thumbs changed nothing. This suite is the contract for reading it.
 *
 * Four jobs:
 *  1. THE NUDGE MATH. Taste is a re-ranking nudge, centred on the candidate pool and
 *     clamped. Centred, because the style vectors are non-negative, so after any like
 *     EVERY look clears 0.5 — only the differences between looks carry preference.
 *  2. NO EVIDENCE, NO CHANGE. Someone who has never tapped like/dislike must get
 *     exactly the slates they get today.
 *  3. NON-VACUITY. Feedback has to actually move the top pick. The first wiring I
 *     measured moved it 0% of the time: the top candidates sit 1–2 points apart and
 *     an un-centred nudge never cleared them. A test that only checked "taste is
 *     read" would have passed.
 *  4. COHERENCE STAYS IN CHARGE. Taste reorders looks inside the top band only, and
 *     never changes the score the UI shows. `badPairs` ("these two don't go") is a
 *     hard filter — except when the user pinned both pieces themselves.
 *
 * Synthetic two-style closet, so it runs with no network and no wardrobe data.
 */

// taste.ts guards every read/write on `typeof window` and persists to localStorage.
// Stub both BEFORE importing it so feedback is recorded through the real code path —
// otherwise each recordOutfitFeedback call would start from an empty state.
const store = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.window = g;
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const { suggestLooks, tasteNudges, TASTE_MAX_POINTS } = await import("@/lib/matching");
const { readTaste, recordOutfitFeedback } = await import("@/lib/taste");
type WardrobeItem = import("@/lib/types").WardrobeItem;
type TasteState = import("@/lib/taste").TasteState;
type ScoredLook = import("@/lib/matching").ScoredLook;

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const near0 = (x: number) => Math.abs(x) < 1e-9;

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

/** Earthy casual. */
const EARTHY = [
  mk("earthy-olive-tee", "top", "tshirt", "#6b7a3a", "olive", "casual", ["casual"]),
  mk("earthy-rust-tee", "top", "tshirt", "#b5532c", "rust", "casual", ["casual"]),
  mk("earthy-tan-chinos", "bottom", "chinos", "#c8a96e", "tan", "casual", ["casual"]),
  mk("earthy-blue-jeans", "bottom", "jeans", "#3b5b85", "blue", "casual", ["casual"]),
  mk("earthy-brown-boots", "shoes", "boots", "#5a3a22", "brown", "casual", ["casual"]),
  mk("earthy-white-sneakers", "shoes", "sneakers", "#f2f2f2", "white", "casual", ["casual"]),
];
/**
 * Monochrome smart. Its best look out-scores EARTHY's by ~4 points, so with no
 * feedback the engine never leads with earthy — which is what makes taste visible.
 */
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

/** Seeded LCG — the engine samples, so every check runs over the same 60 draws. */
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

/** Feedback goes through the real recordOutfitFeedback, on looks the engine made. */
const tasteAfter = (record: () => void): TasteState => {
  store.clear();
  record();
  return readTaste();
};
const pool = suggestLooks(CLOSET, { count: 60, candidates: 60, random: rng(1) });
const pureEarthy = pool.filter((l) => l.items.every((i) => i.id.startsWith("earthy-")));
const pureMono = pool.filter((l) => l.items.every((i) => i.id.startsWith("mono-")));
ok(pureEarthy.length >= 1 && pureMono.length >= 3, "precondition: the engine makes pure looks of both styles",
  `${pureEarthy.length} earthy, ${pureMono.length} mono`);
const empty = tasteAfter(() => {});
const oneLike = tasteAfter(() => recordOutfitFeedback(pureEarthy[0].items, "like"));
const threeDislikes = tasteAfter(() =>
  pureMono.slice(0, 3).forEach((l) => recordOutfitFeedback(l.items, "dislike")),
);

// ---------------------------------------------------------------------------
console.log("\n=== 1. The nudge: centred on the pool, clamped ===");
const flat = tasteNudges([0.5, 0.5, 0.5]);
ok(flat.every(near0), "no preference → no nudge", JSON.stringify(flat));
// Exact binary fractions throughout, so "zero" below is arithmetic, not luck.
const lifted = tasteNudges([0.75, 0.75, 0.75]);
ok(lifted.every(near0), "a uniform lift is not a preference (centred on the pool, not on 0.5)",
  JSON.stringify(lifted));
const ordered = tasteNudges([0.4375, 0.5, 0.5625]);
ok(ordered[0] < 0 && near0(ordered[1]) && ordered[2] > 0,
  "closer to your taste ranks up, further ranks down, the pool mean stays put", JSON.stringify(ordered));
const polar = tasteNudges([0, 1]);
ok(polar[0] === -TASTE_MAX_POINTS && polar[1] === TASTE_MAX_POINTS,
  "the most polarised taste is clamped to ±TASTE_MAX_POINTS", JSON.stringify(polar));
ok(tasteNudges([]).length === 0, "an empty pool nudges nothing");

// ---------------------------------------------------------------------------
console.log("\n=== 2. No feedback, no change ===");
// Every caller passes readTaste(), which is empty() for anyone who never tapped a
// thumb — that has to be indistinguishable from passing nothing at all.
const sig = (looks: ScoredLook[]) => looks.map((l) => `${l.itemIds.join(",")}@${l.score}`).join(" / ");
const same = SEEDS.slice(0, 30).filter(
  (s) =>
    sig(suggestLooks(CLOSET, { count: 3, random: rng(s) })) ===
    sig(suggestLooks(CLOSET, { count: 3, random: rng(s), taste: empty })),
).length;
ok(same === 30, "an empty taste state returns exactly today's slates", `${same}/30 identical`);

// ---------------------------------------------------------------------------
console.log("\n=== 3. Feedback actually moves the top pick ===");
const earthyLeads = (taste?: TasteState) => {
  const tops = SEEDS.map((s) => suggestLooks(CLOSET, { count: 1, random: rng(s), taste })[0]).filter(Boolean);
  return tops.filter(isEarthy).length / tops.length;
};
const base = earthyLeads();
// Without this the next two prove nothing — taste would be pushing on an open door.
ok(base <= 0.1, "precondition: with no feedback the engine leads with monochrome", `earthy leads ${pct(base)}`);
const afterLike = earthyLeads(oneLike);
ok(afterLike >= 0.9, "ONE like on an earthy look → earthy leads", `earthy leads ${pct(afterLike)}`);
const afterDislikes = earthyLeads(threeDislikes);
ok(afterDislikes >= 0.9, "three dislikes on monochrome looks → monochrome stops leading",
  `earthy leads ${pct(afterDislikes)}`);

// ---------------------------------------------------------------------------
console.log("\n=== 4. Coherence stays in charge ===");
// The badge reads `score`. If taste leaked into it, a look would claim to be a
// better pairing because you liked something similar last week.
let checked = 0;
let matched = 0;
for (const s of SEEDS.slice(0, 15)) {
  const plain = suggestLooks(CLOSET, { count: 60, candidates: 60, random: rng(s) });
  const coherence = new Map(plain.map((l) => [[...l.itemIds].sort().join("|"), l.score]));
  for (const l of suggestLooks(CLOSET, { count: 3, random: rng(s), taste: oneLike })) {
    checked++;
    if (coherence.get([...l.itemIds].sort().join("|")) === l.score) matched++;
  }
}
ok(checked > 0 && matched === checked, "the score the UI shows is still pure coherence, not score + taste",
  `${matched}/${checked}`);

const bound = 2 * TASTE_MAX_POINTS;
let worst = 0;
for (const s of SEEDS) {
  const best = suggestLooks(CLOSET, { count: 1, random: rng(s) })[0];
  for (const taste of [oneLike, threeDislikes]) {
    const top = suggestLooks(CLOSET, { count: 1, random: rng(s), taste })[0];
    worst = Math.max(worst, best.score - top.score);
  }
}
ok(worst <= bound, "taste only promotes looks within 2 × TASTE_MAX_POINTS of the best one",
  `worst give-up ${worst} vs bound ${bound}`);

const PAIR = ["mono-grey-trousers", "mono-white-oxford"]; // sorted, as taste.ts keys them
const hasPair = (l: ScoredLook) => PAIR.every((id) => l.itemIds.includes(id));
const badTaste: TasteState = { ...empty, badPairs: [PAIR.join("|")] };
const pairRate = (opts: { anchors?: WardrobeItem[]; taste?: TasteState }) =>
  SEEDS.filter((s) => suggestLooks(CLOSET, { count: 3, random: rng(s), ...opts }).some(hasPair)).length /
  SEEDS.length;

const pairBase = pairRate({});
ok(pairBase >= 0.5, "precondition: oxford + grey trousers is a staple of the baseline slates", pct(pairBase));
const pairAfter = pairRate({ taste: badTaste });
ok(pairAfter === 0, "a pair marked 'doesn't go' never appears again", `in ${pct(pairAfter)} of slates`);

const oxford = byId("mono-white-oxford");
const anchoredBase = pairRate({ anchors: [oxford] });
ok(anchoredBase >= 0.3, "precondition: pinning the oxford still draws grey trousers beside it",
  pct(anchoredBase));
const anchoredAfter = pairRate({ anchors: [oxford], taste: badTaste });
ok(anchoredAfter === 0, "pinning one half of a bad pair doesn't let the engine draw the other half",
  `in ${pct(anchoredAfter)} of slates`);

// Over-blocking guard: a filter that empties the result "passes" every check above.
const pinned = suggestLooks(CLOSET, {
  anchors: [oxford, byId("mono-grey-trousers")],
  count: 3,
  random: rng(42),
  taste: badTaste,
});
ok(pinned.length > 0 && pinned.every(hasPair),
  "…but pinning BOTH halves is an explicit ask, and it beats old feedback", `${pinned.length} looks`);

// ---------------------------------------------------------------------------
console.log("\n=== 5. Telemetry carries the signal ===");
// engine-feedback logs `signals` with every slate. Without the affinity in there,
// nobody can ever tell whether taste-led looks get kept and worn (AJA-255).
const liked = suggestLooks(CLOSET, { count: 3, random: rng(7), taste: oneLike });
ok(
  liked.length > 0 &&
    liked.every((l) => typeof l.signals.tasteAffinity === "number" &&
      l.signals.tasteAffinity >= 0 && l.signals.tasteAffinity <= 1),
  "with feedback, every look carries tasteAffinity in [0, 1]",
  liked.map((l) => l.signals.tasteAffinity?.toFixed(3) ?? "—").join(", "),
);
const unliked = suggestLooks(CLOSET, { count: 3, random: rng(7), taste: empty });
ok(unliked.every((l) => l.signals.tasteAffinity === undefined),
  "without feedback there is none, so 'no data' never averages in as 'neutral'");

console.log(`\n${fails === 0 ? "TASTE LOOP CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
