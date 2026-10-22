/**
 * AJA-301 — gate for src/lib/visual-index.ts: WHEN the app calls /api/embed.
 *
 * Run: npm run test:visual-index
 *
 * The maths lives elsewhere (test-visual-dupes). This is the part where a bug costs real
 * quota or never stops: what gets embedded, that finished work is never redone, that
 * failures back off instead of retrying on every mount, and that 401 / 501 / 429 stop
 * the calls rather than looping. `fetch` and `localStorage` are stubbed; every check
 * reads what would have been SENT.
 */
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
type Sent = { ids: string[] };
let sent: Sent[] = [];
type Reply = { status: number; results?: (id: string) => string | null; retryAfter?: string; throws?: boolean };
let reply: Reply = { status: 200 };
g.fetch = async (_url: string, init: { body: string }) => {
  const ids = (JSON.parse(init.body).items as { id: string }[]).map((x) => x.id);
  sent.push({ ids });
  if (reply.throws) throw new Error("network down");
  await new Promise((r) => setTimeout(r, 5)); // a real round trip, so concurrent calls overlap
  return {
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    headers: { get: (h: string) => (h.toLowerCase() === "retry-after" ? reply.retryAfter ?? null : null) },
    json: async () => ({ results: ids.map((id) => ({ id, vector: reply.results ? reply.results(id) : VEC })) }),
  };
};

const { quantizeVector, makeVisualLookup } = await import("@/lib/visual-similarity");
const { clearVisualIndex, ensureVisualVectors, loadVisualIndex, needsVectors, useVisualIndex } = await import("@/lib/visual-index");
type WardrobeItem = import("@/lib/types").WardrobeItem;

const VEC = quantizeVector(Array.from({ length: 768 }, (_, i) => Math.sin(i)));

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};
const mk = (id: string, p: Partial<WardrobeItem> = {}): WardrobeItem =>
  ({ id, name: id, category: "top", color: "#808080", tags: [], seasons: [], wishlist: false,
     imageUrl: `https://x.test/${id}.jpg`, createdAt: "2026-01-01T00:00:00.000Z", ...p }) as WardrobeItem;
const fresh = (r: Reply = { status: 200 }) => {
  clearVisualIndex();
  sent = [];
  reply = r;
};
const allSent = () => sent.flatMap((s) => s.ids);

const closet = [
  mk("wish-top", { wishlist: true }),
  mk("wish-shoes", { category: "shoes", wishlist: true }),
  mk("own-top"),
  mk("own-bottom", { category: "bottom" }),
  mk("own-shoes", { category: "shoes" }),
  mk("demo-w-white-shirt"),
  mk("own-top-blob", { imageUrl: "blob:https://x.test/1" }),
  mk("wish-no-image", { wishlist: true, imageUrl: "" }),
];

// ---------------------------------------------------------------------------
console.log("\n=== 1. Only what the wishlist can use ===");
fresh();
await ensureVisualVectors(closet);
ok(JSON.stringify(allSent().sort()) === JSON.stringify(["own-shoes", "own-top", "wish-shoes", "wish-top"]),
  "every wish + owned pieces in a wished-for category; no bottoms, samples, blob: or image-less pieces",
  allSent().sort().join(", "));
const lookup = makeVisualLookup(useVisualIndex.getState().entries);
ok(lookup(closet[2]) !== null, "the stored vector is usable through the lookup");
ok(!JSON.stringify(store.get("wardrobe-store-v2") ?? "").includes(VEC.slice(0, 40)),
  "nothing is written into the synced wardrobe snapshot");

console.log("\n=== 2. Finished work is never redone ===");
sent = [];
await ensureVisualVectors(closet);
ok(sent.length === 0, "a second visit makes no calls", `${sent.length} calls`);
sent = [];
const recut = closet.map((it) => (it.id === "own-top" ? { ...it, imageUrl: "https://x.test/own-top-v2.jpg" } : it));
await ensureVisualVectors(recut);
ok(JSON.stringify(allSent()) === JSON.stringify(["own-top"]), "a changed photo re-embeds that piece and only that piece", allSent().join(", "));
ok(makeVisualLookup(useVisualIndex.getState().entries)(recut[2]) !== null, "…and the new vector serves the new photo");

console.log("\n=== 3. Batches, priority, and one run at a time ===");
fresh();
const big = [mk("w", { wishlist: true }), ...Array.from({ length: 25 }, (_, i) => mk(`t${i}`))];
await ensureVisualVectors(big, { priorityIds: ["t24"] });
ok(sent.every((s) => s.ids.length <= 16), "no call carries more than 16 images", sent.map((s) => s.ids.length).join("+"));
ok(allSent().length === 26 && new Set(allSent()).size === 26, "all 26 pieces embedded exactly once", `${allSent().length} sent`);
ok(sent[0]?.ids.includes("t24"), "the piece the open sheet needs goes in the first call");
fresh();
await Promise.all([ensureVisualVectors(big), ensureVisualVectors(big), ensureVisualVectors(big, { priorityIds: ["t3"] })]);
ok(allSent().length === 26 && new Set(allSent()).size === 26, "three overlapping triggers still embed each piece once",
  `${allSent().length} sent`);

console.log("\n=== 4. Failures back off instead of looping ===");
fresh({ status: 200, results: (id) => (id === "own-top" ? null : VEC) });
await ensureVisualVectors(closet);
sent = [];
reply = { status: 200 };
await ensureVisualVectors(closet);
ok(!allSent().includes("own-top"), "an image that failed is not retried on the next visit (blocked retailer, dead link)");
const failsNow = useVisualIndex.getState().fails;
useVisualIndex.setState({ fails: Object.fromEntries(Object.entries(failsNow).map(([h, f]) => [h, { ...f, until: 0 }])) });
sent = [];
await ensureVisualVectors(closet);
ok(JSON.stringify(allSent()) === JSON.stringify(["own-top"]), "…but is retried once its backoff expires", allSent().join(", "));

fresh({ status: 200, throws: true });
await ensureVisualVectors(closet);
const thrownCalls = sent.length;
sent = [];
reply = { status: 200 };
await ensureVisualVectors(closet);
ok(thrownCalls > 0 && sent.length === 0, "a network error backs the batch off too");

console.log("\n=== 5. 401 / 501 / 429 stop the calls ===");
for (const status of [401, 501]) {
  fresh({ status });
  await ensureVisualVectors(closet);
  const first = sent.length;
  sent = [];
  reply = { status: 200 };
  await ensureVisualVectors([...closet, mk("wish-new", { wishlist: true })]);
  ok(first >= 1 && sent.length === 0, `${status} turns the feature off for the session — one attempt, then silence`);
}
fresh({ status: 429, retryAfter: "60" });
await ensureVisualVectors(closet);
sent = [];
reply = { status: 200 };
await ensureVisualVectors(closet);
ok(sent.length === 0, "429 pauses until Retry-After instead of hammering");
clearVisualIndex();
sent = [];
await ensureVisualVectors(closet);
ok(sent.length >= 1, "clearing (sign-out / reset) lifts a pause or an off switch — signing back in works");

console.log("\n=== 6. Persistence ===");
fresh();
await ensureVisualVectors(closet);
const reloaded = loadVisualIndex();
ok(Object.keys(reloaded.entries).length === 4, "vectors survive a reload", `${Object.keys(reloaded.entries).length} entries`);
const raw = JSON.parse(store.get("wardrobe-visual-v1")!);
store.set("wardrobe-visual-v1", JSON.stringify({ ...raw, model: "some-other-model" }));
ok(Object.keys(loadVisualIndex().entries).length === 0, "vectors from another model are dropped, never mixed");
store.set("wardrobe-visual-v1", "{not json");
ok(Object.keys(loadVisualIndex().entries).length === 0, "a corrupt index loads empty instead of throwing");
fresh();
await ensureVisualVectors(closet);
await ensureVisualVectors(closet.filter((it) => it.id !== "own-top"));
ok(!("own-top" in useVisualIndex.getState().entries), "a deleted piece's vector is pruned");
clearVisualIndex();
ok(!store.has("wardrobe-visual-v1") && Object.keys(useVisualIndex.getState().entries).length === 0,
  "clearVisualIndex wipes memory and storage");

console.log("\n=== 7. Whether the open sheet should wait for pictures ===");
// The sheet shows "Checking your closet…" only while a vector it needs can still arrive.
// Waiting on one that never will would hold the verdict for nothing.
fresh();
ok(needsVectors(closet, ["wish-top", "own-top"]), "before embedding: yes, wait");
await ensureVisualVectors(closet);
ok(!needsVectors(closet, ["wish-top", "own-top"]), "once they're embedded: no");
ok(!needsVectors(closet, ["own-top-blob", "demo-w-white-shirt"]), "pieces that can never be embedded: no");
fresh({ status: 200, results: () => null });
await ensureVisualVectors(closet);
ok(!needsVectors(closet, ["wish-top"]), "a piece backing off after a failure: no");
fresh({ status: 401 });
await ensureVisualVectors(closet);
ok(!needsVectors(closet, ["wish-top"]), "feature off for the session: no");

console.log(`\n${fails === 0 ? "VISUAL INDEX CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
