/**
 * AJA-255 — gate for src/lib/engine-feedback.ts.
 *
 * Run: npm run test:feedback
 *
 * Three jobs:
 *  1. REASON INFERENCE. A swap is only useful if the reason is right, so each of
 *     the six codes gets a case that must produce it and (where it matters) a
 *     near-miss that must NOT.
 *  2. THE PIPELINE. remove → add only counts as a swap under real conditions:
 *     same category, inside the window, with a live slate. And `isUntouchedSlate`
 *     has to go false the moment the board is engaged with, or every edit session
 *     would also log a re-roll.
 *  3. NON-VACUITY. The reason distribution over every same-category pair in the
 *     closet must actually SPREAD. If ~everything reads "variety" the inference
 *     is decoration — that is the exact failure mode of the v1 signals this whole
 *     issue exists to fix, and a test that only checks six hand-picked cases
 *     would pass while the feature was useless.
 *
 * Synthetic items for 1 and 2 so it runs with no network and no wardrobe data.
 * Part 3 uses the real closet when a dump is present and skips loudly when not.
 */
import fs from "node:fs";
import path from "node:path";

// engine-feedback guards every side effect on `typeof window`, and reads/writes
// localStorage. Stub both BEFORE importing it so the counters path is exercised
// rather than skipped — a test that silently takes the SSR no-op branch would
// pass without touching any of the code that ships.
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
/** Captured POST bodies, so we assert on what would actually reach the sink. */
const sent: { type: string; payload: Record<string, unknown> }[] = [];
g.fetch = async (_url: string, init?: { body?: string }) => {
  if (init?.body) sent.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({ ok: true }) };
};

const {
  __resetFeedback,
  colourFit,
  fitsSeason,
  inferSwapReason,
  isUntouchedSlate,
  lookKept,
  pieceAdded,
  pieceRemoved,
  readEngineFeedback,
  lookFlagged,
  rerolled,
  slatePicked,
  slateShown,
  boardTouched,
} = await import("@/lib/engine-feedback");
const { dressiness } = await import("@/lib/outfit-rules");
type WardrobeItem = import("@/lib/types").WardrobeItem;
type Category = import("@/lib/types").Category;
type Season = import("@/lib/types").Season;
type ScoredLook = import("@/lib/matching").ScoredLook;

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

/** Minimal item; only the fields the feedback module reads. */
const it = (p: Partial<WardrobeItem> & { category: Category }): WardrobeItem =>
  ({
    id: p.id ?? p.name ?? Math.random().toString(36).slice(2),
    name: p.name ?? "",
    category: p.category,
    color: p.color ?? "#1c1917",
    seasons: p.seasons ?? [],
    tags: [],
    createdAt: 0,
    ...p,
  }) as WardrobeItem;

/** A ScoredLook shaped like the real thing, for slateShown. */
const look = (items: WardrobeItem[], score = 80): ScoredLook =>
  ({
    draft: {} as ScoredLook["draft"],
    itemIds: items.map((i) => i.id),
    items,
    score,
    signals: { color: 0.7, formality: 0.8, weather: 0.6, vibe: 0.5, antiRepeat: 0.9, semantic: 0.6, taste: 0.5 },
    reasons: ["because"],
  }) as ScoredLook;

const SLOTS = ["Safe", "Elevated", "Experimental"];

/**
 * `emit` is deliberately fire-and-forget (telemetry must never block the UI), and
 * it awaits authHeaders() before posting. So every assertion about what reached the
 * sink has to let the microtask queue drain first — asserting synchronously reads
 * an empty array and would have "proved" that nothing is logged.
 */
const flush = () => new Promise((r) => setTimeout(r, 5));

const fresh = async (looks: ScoredLook[], season?: Season) => {
  __resetFeedback();
  sent.length = 0;
  slateShown(looks, { season, slotNames: SLOTS });
  await flush();
};

// ---------------------------------------------------------------------------
console.log("\n=== 1. reason inference ===");

const tee = it({ name: "Plain white t-shirt", category: "top", subcategory: "tshirt", color: "#f5f5f4" });
const buttonUp = it({ name: "Navy button-up shirt", category: "top", subcategory: "shirt", color: "#1e293b" });
const jeans = it({ name: "Indigo jeans", category: "bottom", subcategory: "jeans", color: "#3b4a6b" });
const shoes = it({ name: "White leather sneakers", category: "shoes", subcategory: "sneakers", color: "#efefef" });
const rest = [jeans, shoes];

// Dressiness is what drives the two formality codes, so assert the premise first —
// otherwise a broken SUB_DRESS would make these two cases pass for the wrong reason.
ok(
  (dressiness(tee) ?? -1) < (dressiness(buttonUp) ?? -1),
  "premise: a button-up outranks a tee on dressiness",
  `tee=${dressiness(tee)} shirt=${dressiness(buttonUp)}`,
);
ok(
  inferSwapReason(tee, buttonUp, rest) === "too_casual",
  "tee → button-up reads as 'the look was too casual'",
  inferSwapReason(tee, buttonUp, rest),
);
ok(
  inferSwapReason(buttonUp, tee, rest) === "too_dressy",
  "button-up → tee reads as 'the look was too dressy'",
  inferSwapReason(buttonUp, tee, rest),
);

// weather — only when the piece taken off was actually wrong for the season.
const wool = it({ name: "Wool scarf", category: "accessory", subcategory: "scarf", seasons: ["winter"] });
const cap = it({ name: "Cotton cap", category: "accessory", subcategory: "hat", seasons: ["summer"] });
ok(fitsSeason(cap, "summer") && !fitsSeason(wool, "summer"), "premise: season eligibility");
ok(
  inferSwapReason(wool, cap, rest, "summer") === "weather",
  "winter-only → summer piece in summer reads as weather",
  inferSwapReason(wool, cap, rest, "summer"),
);
ok(
  inferSwapReason(wool, cap, rest, "winter") !== "weather",
  "the same swap in WINTER is not a weather complaint",
  inferSwapReason(wool, cap, rest, "winter"),
);
ok(
  inferSwapReason(wool, cap, rest, undefined) !== "weather",
  "with no known season, weather is never claimed",
  inferSwapReason(wool, cap, rest, undefined),
);
ok(
  it({ category: "top", seasons: [] }) && fitsSeason(it({ category: "top", seasons: [] }), "summer"),
  "an empty seasons list means all-season, not none",
);

// colour — same category, same dressiness, differing only in how it sits with the board.
const loudA = it({ name: "Tee A", category: "top", subcategory: "tshirt", color: "#e11d48" });
const loudB = it({ name: "Tee B", category: "top", subcategory: "tshirt", color: "#f5f5f4" });
const olive = [it({ category: "bottom", subcategory: "chinos", color: "#4d5b31" })];
const cA = colourFit(loudA, olive);
const cB = colourFit(loudB, olive);
ok(cA !== null && cB !== null, "colourFit measurable against the board", `${cA} vs ${cB}`);
if (cA !== null && cB !== null) {
  const better = cB > cA ? loudB : loudA;
  const worse = cB > cA ? loudA : loudB;
  const delta = Math.abs(cB - cA);
  // Derived at runtime, not asserted as a hardcoded label: the point is that a
  // meaningful colour improvement is CALLED colour, whichever way round it falls.
  const r = inferSwapReason(worse, better, olive);
  ok(
    delta < 0.08 || r === "colour",
    "a clear colour improvement (same sub, same dressiness) reads as colour",
    `delta=${delta.toFixed(3)} → ${r}`,
  );
  ok(
    inferSwapReason(better, worse, olive) !== "colour",
    "swapping to a WORSE colour is not filed as a colour fix",
    inferSwapReason(better, worse, olive),
  );
}

// style vs variety — the residue. Same dressiness, same colour, different subcategory.
const hoodie = it({ name: "Grey hoodie", category: "top", subcategory: "hoodie", color: "#f5f5f4" });
const tee2 = it({ name: "Another white tee", category: "top", subcategory: "tshirt", color: "#f5f5f4", id: "tee2" });
ok(
  inferSwapReason(tee, hoodie, []) === "style",
  "same dressiness, different garment type → style",
  inferSwapReason(tee, hoodie, []),
);
ok(
  inferSwapReason(tee, tee2, []) === "variety",
  "same subcategory, same colour → variety (tunes nothing, and says so)",
  inferSwapReason(tee, tee2, []),
);

// ---------------------------------------------------------------------------
console.log("\n=== 2. the pipeline ===");

await fresh([look([tee, jeans, shoes]), look([buttonUp, jeans, shoes], 76), look([hoodie, jeans, shoes], 71)], "summer");
ok(sent.length === 1 && sent[0].type === "engine_feedback", "slateShown posts one event", `${sent.length}`);
ok((sent[0].payload as { stage?: string }).stage === "shown", "…tagged stage=shown");
ok(
  Array.isArray((sent[0].payload as { looks?: unknown[] }).looks) &&
    ((sent[0].payload as { looks: unknown[] }).looks.length === 3),
  "…carrying all three looks, not just the placed one",
);
ok(isUntouchedSlate(), "a just-shown slate is untouched");

// same category → swap
sent.length = 0;
pieceRemoved(tee, [tee, jeans, shoes]);
ok(!isUntouchedSlate(), "removing a piece marks the slate engaged with");
const r1 = pieceAdded(buttonUp);
await flush();
ok(r1 === "too_casual", "same-category remove→add is a swap with a reason", String(r1));
ok(sent.length === 1 && (sent[0].payload as { stage?: string }).stage === "swap", "…and posts stage=swap");
ok(
  (sent[0].payload as { engine?: string }).engine === "v2" &&
    (sent[0].payload as { slot?: string }).slot === "Safe",
  "…carrying the engine + slot that produced the piece being replaced",
);

// different category → not a swap. This is the case that would quietly poison the
// data: dropping a top and adding a bag is not a complaint about the top.
await fresh([look([tee, jeans, shoes])], "summer");
sent.length = 0;
pieceRemoved(tee, [tee, jeans, shoes]);
ok(pieceAdded(it({ category: "bag", subcategory: "tote" })) === null, "cross-category add is not a swap");
await flush();
ok(
  !sent.some((e) => (e.payload as { stage?: string }).stage === "swap"),
  "…and posts no swap event",
);

// a bare add with no pending removal is not a swap
await fresh([look([tee, jeans, shoes])], "summer");
ok(pieceAdded(buttonUp) === null, "an add with nothing removed first is not a swap");

// with no live slate there is nothing to attribute to
__resetFeedback();
pieceRemoved(tee, [tee, jeans]);
ok(pieceAdded(buttonUp) === null, "no slate → no swap (nothing to attribute it to)");

// re-roll bookkeeping
await fresh([look([tee, jeans, shoes])], "summer");
ok(isUntouchedSlate(), "untouched before the re-roll");
const id = rerolled();
ok(typeof id === "string", "rerolled() returns the slate id");
ok(!isUntouchedSlate(), "a rejected slate can't be rejected twice");
ok(rerolled() === null, "…and a second rerolled() is a no-op");
await flush();
ok(
  !sent.some((e) => (e.payload as { asked?: boolean }).asked),
  "a re-roll no longer claims it asked anything (AJA-262 — it is silent now)",
);

// AJA-262 — the flag. Volunteered, names the look on the board, and does NOT close
// the slate: flagging one vibe must not stop you wearing another.
await fresh([look([tee, jeans, shoes]), look([buttonUp, jeans, shoes], 76), look([hoodie, jeans, shoes], 71)], "summer");
sent.length = 0;
slatePicked(2);
await flush();
sent.length = 0;
ok(lookFlagged("too_dressy") === true, "flagging a live slate succeeds");
await flush();
const fl = sent.find((e) => (e.payload as { stage?: string }).stage === "flag");
ok(!!fl, "…and posts stage=flag");
ok(
  (fl?.payload as { slot?: string })?.slot === "Experimental",
  "…naming WHICH look was on the board, not just the slate",
  String((fl?.payload as { slot?: string })?.slot),
);
ok(
  Array.isArray((fl?.payload as { itemIds?: string[] })?.itemIds) &&
    !!(fl?.payload as { signals?: unknown })?.signals,
  "…with that look's items and signal breakdown, so a complaint can be regressed on them",
);
ok((fl?.payload as { reason?: string })?.reason === "too_dressy", "…and the reason");
ok(readEngineFeedback().flags > 0, "the flag counter moves");
ok((readEngineFeedback().reasons.too_dressy ?? 0) > 0, "the reason tally moves");
// Not closing the slate is the point: a flagged look can still be kept or worn.
sent.length = 0;
lookKept("outfit-flagged", [hoodie.id, jeans.id, shoes.id]);
await flush();
ok(
  sent.some((e) => (e.payload as { stage?: string }).stage === "kept"),
  "a flagged slate can still be kept — flagging is not rejecting",
);
__resetFeedback();
ok(lookFlagged("not_it") === false, "flagging with no live slate is a no-op");

await fresh([look([tee, jeans, shoes])], "summer");
boardTouched();
ok(!isUntouchedSlate(), "an edited board never reads as a rejection");

// kept — gated on the saved look still being the generated one
await fresh([look([tee, jeans, shoes])], "summer");
sent.length = 0;
lookKept("outfit-1", [tee.id, jeans.id, shoes.id]);
await flush();
ok(
  sent.some((e) => (e.payload as { stage?: string }).stage === "kept"),
  "saving the generated look logs kept",
);
await fresh([look([tee, jeans, shoes])], "summer");
sent.length = 0;
lookKept("outfit-2", [tee.id]);
await flush();
ok(
  !sent.some((e) => (e.payload as { stage?: string }).stage === "kept"),
  "saving a board rebuilt by hand (1/3 kept) earns the engine no credit",
);

// counters actually move, and the stub localStorage was really used.
// Three looks, not one: slatePicked(1) on a single-look slate is correctly a no-op,
// and asserting picks>0 against a one-look slate was a bug in this test, not the code.
await fresh([look([tee, jeans, shoes]), look([buttonUp, jeans, shoes], 76), look([hoodie, jeans, shoes], 71)], "summer");
ok(slatePicked(1) === undefined && readEngineFeedback().picks > 0, "slatePicked lands on a real 3-look slate");
pieceRemoved(tee, [tee, jeans, shoes]);
pieceAdded(buttonUp);
await flush();
const c = readEngineFeedback();
ok(c.shown > 0 && c.picks > 0 && c.swaps > 0, "counters increment", JSON.stringify(c));
ok(store.size > 0, "…via the real localStorage path, not the SSR no-op branch");
ok((c.reasons.too_casual ?? 0) > 0, "reason tallies land", JSON.stringify(c.reasons));

// A wear is only engine feedback if it's a LOOK. ItemCard's "worn today" logs one
// loose garment with no outfit; counting that would flatter the engine with data it
// had nothing to do with.
const { lookWorn } = await import("@/lib/engine-feedback");
await fresh([look([tee, jeans, shoes])], "summer");
sent.length = 0;
const wornBefore = readEngineFeedback().worn;
lookWorn({ itemIds: [tee.id] });
await flush();
ok(
  readEngineFeedback().worn === wornBefore && sent.length === 0,
  "a single loose garment marked worn is NOT counted as engine feedback",
);
lookWorn({ itemIds: [tee.id, jeans.id] });
await flush();
ok(readEngineFeedback().worn === wornBefore + 1, "two pieces logged together IS a look");
lookWorn({ outfitId: "o1", itemIds: [tee.id] });
await flush();
ok(readEngineFeedback().worn === wornBefore + 2, "a saved outfit is a look even with one piece");

// ---------------------------------------------------------------------------
console.log("\n=== 3. non-vacuity on the real closet ===");

/** A closet dump, if one is lying around. Never required — this test must run anywhere. */
function loadCloset(): WardrobeItem[] | null {
  const candidates = [
    process.env.CLOSET_JSON,
    path.join(process.cwd(), "scripts/.closet.json"),
    "/private/tmp/claude-501/-Users-ajaythirumurthi-wardrobe-app/827ea5b7-6f1b-410f-96cc-190173ecd9ab/scratchpad/closet.json",
  ].filter((x): x is string => !!x);
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
      if (Array.isArray(parsed) && parsed.length) return parsed as WardrobeItem[];
    } catch {
      /* try the next one */
    }
  }
  return null;
}

const closet = loadCloset();
if (!closet) {
  console.log("  SKIP  no closet dump found — set CLOSET_JSON to run the distribution check");
} else {
  const owned = closet.filter((i) => !i.wishlist && i.imageUrl);
  console.log(`  closet: ${owned.length} owned pieces`);
  // Every same-category ordered pair is a swap the user could plausibly make.
  const byCat = new Map<string, WardrobeItem[]>();
  for (const i of owned) {
    const list = byCat.get(i.category) ?? [];
    list.push(i);
    byCat.set(i.category, list);
  }
  const tally: Record<string, number> = {};
  let total = 0;
  const board = [
    it({ category: "bottom", subcategory: "jeans", color: "#3b4a6b" }),
    it({ category: "shoes", subcategory: "sneakers", color: "#efefef" }),
  ];
  for (const [, list] of byCat) {
    for (const a of list) {
      for (const b of list) {
        if (a.id === b.id) continue;
        const reason = inferSwapReason(a, b, board, "summer");
        tally[reason] = (tally[reason] ?? 0) + 1;
        total++;
      }
    }
  }
  const rows = Object.entries(tally).sort((x, y) => y[1] - x[1]);
  for (const [k, n] of rows) {
    console.log(`     ${k.padEnd(11)} ${((n / total) * 100).toFixed(1)}%  (${n})`);
  }
  const top = rows[0];
  ok(total > 500, "enough real pairs to say anything", `${total}`);
  // The v1 lesson: a signal that returns one value is not a signal. 82.9% of v1
  // colour pairs came back identical and the term was effectively a constant.
  ok(top[1] / total < 0.7, "no single reason swallows the distribution", `${top[0]} at ${((top[1] / total) * 100).toFixed(1)}%`);
  ok(rows.length >= 4, "at least four of the six codes actually occur", `${rows.length}`);
  // "variety" is the code that tunes nothing. If most real swaps land there the
  // instrumentation is collecting noise.
  const dead = (tally.variety ?? 0) / total;
  ok(dead < 0.4, "'variety' (the code that tunes nothing) is a minority", `${(dead * 100).toFixed(1)}%`);
  // And the two formality codes — the ones that vote directly on a weight — must
  // be reachable on real data, not just on my hand-built pair.
  const formality = ((tally.too_dressy ?? 0) + (tally.too_casual ?? 0)) / total;
  ok(formality > 0.1, "formality complaints are reachable on real items", `${(formality * 100).toFixed(1)}%`);
}

console.log(`\n${fails === 0 ? "FEEDBACK CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
