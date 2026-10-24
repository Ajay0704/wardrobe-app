/**
 * AJA-305 — gate for `Outfit.spinPath` and its persistence.
 *
 * Run: npm run test:outfit-spin
 *
 * Same trap as test-outfit-render.mts: a new Outfit field that isn't whitelisted in
 * `normalizeOutfit` is silently dropped on reload (AJA-223/239/244/245), and a SIGNED url
 * that reaches the snapshot syncs everywhere and expires. Plus one rule of its own: a spin
 * is made FROM the render, so replacing the render must clear it.
 *
 * NON-VACUITY: every "rejected" assert is preceded by a "this slot works" assert on the
 * same field, so a misspelt field name can't make the rejections pass trivially.
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

const PERSIST_KEY = "wardrobe-store-v2";
let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const USER = "4cea3e46-1f1b-4457-b57f-a02c2b6d5e1e";
const RENDER = `${USER}/${crypto.randomUUID()}.jpg`;
const RENDER2 = `${USER}/${crypto.randomUUID()}.jpg`;
const SPIN = `${USER}/${crypto.randomUUID()}.mp4`;
const SIGNED = `https://x.supabase.co/storage/v1/object/sign/renders-private/${SPIN}?token=eyJhbGci`;
const HUGE = "data:video/mp4;base64," + "A".repeat(400_000);

const s = () => useWardrobe.getState();
const byId = (id: string) => s().outfits.find((o) => o.id === id);
const persisted = () => JSON.parse(store.get(PERSIST_KEY) ?? "{}").state ?? {};

console.log("\n=== 1. the setter ===");
const id = s().saveOutfit("Spin test", undefined, [], undefined, undefined);
s().setOutfitRender(id, RENDER);
s().setOutfitSpin(id, SPIN);
ok(byId(id)?.spinPath === SPIN, "a valid .mp4 path is stored");
s().setOutfitSpin(id, SIGNED);
ok(byId(id)?.spinPath === undefined, "the setter rejects a signed URL");
s().setOutfitSpin(id, SPIN);
s().setOutfitSpin(id, HUGE);
ok(byId(id)?.spinPath === undefined, "the setter rejects inline data");
s().setOutfitSpin(id, SPIN);
s().setOutfitSpin(id, null);
ok(byId(id)?.spinPath === undefined, "null clears it");

console.log("\n=== 2. a spin belongs to one render ===");
s().setOutfitSpin(id, SPIN);
s().setOutfitRender(id, RENDER);
ok(byId(id)?.spinPath === SPIN, "re-setting the SAME render keeps the spin");
s().setOutfitRender(id, RENDER2);
ok(byId(id)?.spinPath === undefined, "a DIFFERENT render clears the spin");
s().setOutfitSpin(id, SPIN);
s().setOutfitRender(id, null);
ok(byId(id)?.spinPath === undefined, "removing the render clears the spin");

console.log("\n=== 3. duplicate: one blob, one owner ===");
s().setOutfitRender(id, RENDER);
s().setOutfitSpin(id, SPIN);
const dup = s().duplicateOutfit(id);
ok(!!dup && byId(dup)?.spinPath === undefined, "a duplicate does NOT inherit the spin");
ok(byId(id)?.spinPath === SPIN, "…and the original keeps it");

console.log("\n=== 4. partialize + merge ===");
ok(
  persisted().outfits?.find((o: { id: string }) => o.id === id)?.spinPath === SPIN,
  "spinPath reaches localStorage",
);
store.set(
  PERSIST_KEY,
  JSON.stringify({
    version: 0,
    state: {
      outfits: [
        { id: "a", name: "good", itemIds: [], createdAt: 1, tryOnRenderPath: RENDER, spinPath: SPIN },
        { id: "b", name: "signed", itemIds: [], createdAt: 1, spinPath: SIGNED },
        { id: "c", name: "nested", itemIds: [], createdAt: 1, spinPath: `${USER}/sub/x.mp4` },
      ],
    },
  }),
);
await useWardrobe.persist.rehydrate();
const after = Object.fromEntries(s().outfits.map((o) => [o.id, o.spinPath]));
ok(after.a === SPIN, "a genuine path survives merge (normalizeOutfit whitelist)", String(after.a));
ok(after.b === undefined, "a signed URL is stripped by merge");
ok(after.c === undefined, "a nested path is stripped by merge");

console.log("\n=== 5. the scrubber (also the push gate) ===");
const scrubbed = scrubSnapshotImages({
  items: [],
  outfits: [
    { id: "x", name: "", itemIds: [], createdAt: 1, spinPath: SPIN },
    { id: "y", name: "", itemIds: [], createdAt: 1, spinPath: SIGNED, tryOnRenderPath: RENDER },
  ],
} as never) as { outfits: Array<Record<string, unknown>> };
ok(scrubbed.outfits[0].spinPath === SPIN, "the scrubber keeps a genuine path");
ok(!("spinPath" in scrubbed.outfits[1]), "the scrubber deletes a signed URL");
ok(scrubbed.outfits[1].tryOnRenderPath === RENDER, "…without touching a good render on the same look");

console.log("\n=== 6. a render's spin has one findable name (AJA-308) ===");
// The route stores a render's first spin here and answers a repeat request with it, and
// the client looks here for a spin whose request died on the phone. Both only work if the
// name is derived from the render alone, and is a path every validator accepts.
const { spinPathFor, isRenderPath } = await import("@/lib/supabase/private-storage");
const renderId = crypto.randomUUID();
const derived = spinPathFor(`${USER}/${renderId}.jpg`);
ok(derived === `${USER}/${renderId}.spin.mp4`, "a .jpg render's spin is <uid>/<stem>.spin.mp4", String(derived));
ok(spinPathFor(`${USER}/${renderId}.png`) === derived, "the extension doesn't change the name");
ok(spinPathFor(`${USER}/${renderId}.jpg`) === derived, "the same render always gives the same name");
ok(isRenderPath(derived) && derived!.split("/").length === 2, "it passes isRenderPath (one slash)");
ok(spinPathFor(SIGNED) === null, "a signed URL has no spin name");
ok(spinPathFor(`${USER}/sub/x.jpg`) === null, "a nested path has no spin name");
ok(spinPathFor(undefined) === null, "nothing has no spin name");

console.log(fails === 0 ? "\nOUTFIT-SPIN CHECKS PASSED" : `\n${fails} OUTFIT-SPIN CHECK(S) FAILED`);
if (fails) process.exit(1);
