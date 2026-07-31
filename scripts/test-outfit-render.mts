/**
 * AJA-275 Phase 2 — gate for `Outfit.tryOnRenderPath` and its persistence.
 *
 * Run: npm run test:render
 *
 * The point of this file is the ROUND TRIP through the real store. Adding a field
 * without adding it to `normalizeOutfit` has silently dropped work four separate
 * times (AJA-223 / 239 / 244 / 245), and a validator nobody wired into `merge` is
 * as useless as no validator. So this drives the real zustand persist config: the
 * real setter, the real localStorage payload, the real `merge`.
 *
 * The failure this is really guarding against is subtler than a dropped field. If a
 * SIGNED url ever reaches the snapshot it syncs to every device and expires an hour
 * later, leaving a look whose thumbnail stops loading for no visible reason — and
 * none of the pre-existing scrubbers would catch it, because they only test `^data:`.
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
g.fetch = async () => ({ ok: true, json: async () => ({}) });
g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const { useWardrobe } = await import("@/lib/store");
const { scrubSnapshotImages } = await import("@/lib/heal");
const { isRenderPath } = await import("@/lib/supabase/private-storage");

const PERSIST_KEY = "wardrobe-store-v2";
let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const USER = "4cea3e46-1f1b-4457-b57f-a02c2b6d5e1e";
const GOOD = `${USER}/${crypto.randomUUID()}.jpg`;
const SIGNED = `https://x.supabase.co/storage/v1/object/sign/renders-private/${GOOD}?token=eyJhbGci`;
const HUGE = "data:image/jpeg;base64," + "A".repeat(400_000);

const persisted = () => JSON.parse(store.get(PERSIST_KEY) ?? "{}").state ?? {};
const outfitById = (id: string) => useWardrobe.getState().outfits.find((o) => o.id === id);

// ---------------------------------------------------------------------------
console.log("\n=== 1. the setter ===");
const id = useWardrobe.getState().saveOutfit("Render test", undefined, [], undefined, undefined);
ok(!!outfitById(id), "saveOutfit returned a usable id");

useWardrobe.getState().setOutfitRender(id, GOOD);
ok(outfitById(id)?.tryOnRenderPath === GOOD, "a valid path is stored");

useWardrobe.getState().setOutfitRender(id, SIGNED);
ok(
  outfitById(id)?.tryOnRenderPath === undefined,
  "the setter REJECTS a signed URL rather than storing it",
  String(outfitById(id)?.tryOnRenderPath).slice(0, 40),
);

useWardrobe.getState().setOutfitRender(id, GOOD);
useWardrobe.getState().setOutfitRender(id, HUGE);
ok(outfitById(id)?.tryOnRenderPath === undefined, "the setter rejects an oversized data URL");

useWardrobe.getState().setOutfitRender(id, GOOD);
useWardrobe.getState().setOutfitRender(id, null);
ok(outfitById(id)?.tryOnRenderPath === undefined, "null clears the render (Phase 5 needs this)");

// ---------------------------------------------------------------------------
console.log("\n=== 2. partialize: does it reach localStorage at all? ===");
useWardrobe.getState().setOutfitRender(id, GOOD);
const saved = persisted().outfits?.find((o: { id: string }) => o.id === id);
ok(!!store.get(PERSIST_KEY), "the store actually wrote to localStorage");
ok(
  saved?.tryOnRenderPath === GOOD,
  "tryOnRenderPath survives `partialize` (the AJA-223/239/244/245 trap)",
  JSON.stringify(saved?.tryOnRenderPath),
);

// ---------------------------------------------------------------------------
console.log("\n=== 3. merge: a corrupt persisted blob is cleaned, not trusted ===");
// A signed URL is the dangerous case: short, https, invisible to `isBadInline`.
store.set(
  PERSIST_KEY,
  JSON.stringify({
    version: 0,
    state: {
      outfits: [
        { id: "a", name: "signed", itemIds: [], createdAt: 1, tryOnRenderPath: SIGNED },
        { id: "b", name: "huge", itemIds: [], createdAt: 1, tryOnRenderPath: HUGE },
        { id: "c", name: "nested", itemIds: [], createdAt: 1, tryOnRenderPath: `${USER}/sub/x.jpg` },
        { id: "d", name: "good", itemIds: [], createdAt: 1, tryOnRenderPath: GOOD, favorite: true },
      ],
    },
  }),
);
await useWardrobe.persist.rehydrate();
const after = Object.fromEntries(
  useWardrobe.getState().outfits.map((o) => [o.id, o.tryOnRenderPath]),
);
ok(after.a === undefined, "a signed URL is stripped by merge", String(after.a).slice(0, 40));
ok(after.b === undefined, "an oversized data URL is stripped by merge");
ok(
  after.c === undefined,
  "a NESTED path is stripped (it would survive account deletion)",
  String(after.c),
);
ok(after.d === GOOD, "a genuine path survives merge", String(after.d));
ok(
  useWardrobe.getState().outfits.find((o) => o.id === "d")?.favorite === true,
  "…and the pre-existing allowlist entries still work alongside it",
);

// ---------------------------------------------------------------------------
console.log("\n=== 4. the scrubber, called directly ===");
// heal.ts runs on both persist boundaries AND on remote pulls, so a bad value
// arriving from another device has to be caught here too.
const scrubbed = scrubSnapshotImages({
  items: [],
  outfits: [
    { id: "x", name: "", itemIds: [], createdAt: 1, tryOnRenderPath: SIGNED },
    { id: "y", name: "", itemIds: [], createdAt: 1, tryOnRenderPath: GOOD },
    { id: "z", name: "", itemIds: [], createdAt: 1 },
  ],
} as never) as { outfits: Array<{ id: string; tryOnRenderPath?: string }> };
const m = Object.fromEntries(scrubbed.outfits.map((o) => [o.id, o.tryOnRenderPath]));
ok(m.x === undefined, "scrubSnapshotImages strips a signed URL from an outfit");
ok(m.y === GOOD, "scrubSnapshotImages leaves a real path alone");
ok(!("tryOnRenderPath" in scrubbed.outfits[2]), "an absent field stays absent (no undefined noise)");

// ---------------------------------------------------------------------------
console.log("\n=== 5. size: a path must be cheap enough to sync ===");
// The whole reason for storing a path is the snapshot budget. Assert the shape of
// that win rather than trusting the comment.
ok(GOOD.length < 100, `a path is ${GOOD.length} chars`);
ok(HUGE.length > 200_000, `a data URL would be ${HUGE.length} chars`);
ok(
  isRenderPath(GOOD) && !isRenderPath(SIGNED) && !isRenderPath(HUGE),
  "the guard agrees with all three cases",
);

console.log(fails === 0 ? "\nOUTFIT-RENDER CHECKS PASSED" : `\n${fails} OUTFIT-RENDER CHECK(S) FAILED`);
if (fails) process.exit(1);
