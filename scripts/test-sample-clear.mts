/**
 * AJA-277 — the starter closet must retire itself the moment a real owned piece lands.
 *
 * This is a behaviour test, not a unit test of `stripSamples`: it drives the real store
 * actions so a future refactor that moves the clearing logic somewhere else still has to
 * keep the guarantee. The bug being locked down is that `clearSamples()` used to be
 * reachable from ONE manual button and no add path ever called it.
 *
 * Run: npm run test:samples
 */
import { useWardrobe } from "@/lib/store";
import { isSampleItem, sampleCloset } from "@/lib/demo-data";
import { distinctLookCount } from "@/lib/looks";
import type { CanvasItem, WardrobeItem } from "@/lib/types";

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const S = () => useWardrobe.getState();

/** Fresh starter closet, plus a sample tile on the canvas and a sample in the draft —
 *  the states auto-clear has to tidy, not just the item list. */
function seedSamples(gender: "male" | "female" = "male") {
  const { items, outfits } = sampleCloset(gender);
  const top = items.find((i) => i.category === "top")!;
  const shoes = items.find((i) => i.category === "shoes")!;
  useWardrobe.setState({
    items: [...items],
    outfits: [...outfits],
    calendar: [{ date: "2026-08-01", itemIds: [top.id], outfitId: outfits[0].id }],
    draft: { top: [top.id], bottom: [], dress: [], outerwear: [], shoes: [shoes.id], accessories: [] },
    canvasDraft: [
      { id: "c1", kind: "item", itemId: top.id, x: 0, y: 0, width: 80, height: 80, rotation: 0, zIndex: 0, flipped: false },
      { id: "c2", kind: "text", text: "hello", x: 0, y: 0, width: 40, height: 20, rotation: 0, zIndex: 1, flipped: false },
    ] as CanvasItem[],
  });
  return { top, shoes };
}

const REAL: Omit<WardrobeItem, "id" | "createdAt"> = {
  name: "My actual tee",
  category: "top",
  color: "#333333",
  seasons: [],
  tags: [],
  wishlist: false,
  imageUrl: "https://example.invalid/real.png",
} as unknown as Omit<WardrobeItem, "id" | "createdAt">;

console.log("\n1. addItem with a real owned piece clears the whole starter closet");
{
  seedSamples();
  ok(S().items.length === 8, "seeded 8 samples", `got ${S().items.length}`);
  S().addItem(REAL);
  const s = S();
  ok(s.items.length === 1, "only the real item remains", `${s.items.length} items`);
  ok(!s.items.some(isSampleItem), "no sample items left");
  ok(s.items[0].name === "My actual tee", "the real item survived");
  ok(s.outfits.length === 0, "pre-saved sample outfits dropped", `${s.outfits.length} left`);
  ok(s.calendar.every((e) => e.itemIds.length === 0), "sample ids gone from the calendar");
  ok(Object.values(s.draft).every((ids) => ids.length === 0), "sample ids gone from the builder draft");
  ok(
    !s.canvasDraft.some((n) => (n.kind ?? "item") === "item"),
    "sample tile gone from the canvas board",
  );
  ok(
    s.canvasDraft.some((n) => n.kind === "text"),
    "non-item canvas nodes are NOT collateral damage",
  );
}

console.log("\n2. a WISH does not retire the starter closet");
{
  seedSamples();
  S().addItem({ ...REAL, wishlist: true } as typeof REAL);
  const s = S();
  ok(s.items.filter(isSampleItem).length === 8, "samples untouched", `${s.items.filter(isSampleItem).length} left`);
  ok(s.items.length === 9, "the wish was still added", `${s.items.length} items`);
  ok(s.outfits.length === 3, "sample outfits untouched");
}

console.log("\n3. absorbItems (wishlist inbox / another device)");
{
  seedSamples();
  S().absorbItems([{ ...REAL, id: "wish-1", createdAt: Date.now(), wishlist: true } as WardrobeItem]);
  ok(S().items.filter(isSampleItem).length === 8, "an inbox of wishes leaves samples alone");

  seedSamples();
  S().absorbItems([{ ...REAL, id: "real-1", createdAt: Date.now() } as WardrobeItem]);
  ok(!S().items.some(isSampleItem), "a real owned piece from the inbox clears them");
  ok(S().items.length === 1, "and it is the only item left", `${S().items.length}`);
}

console.log("\n4. hydrateFromRemote can't resurrect a retired starter closet");
{
  seedSamples();
  const { items: samples } = sampleCloset("male");
  // A snapshot that legitimately carries both — the shape AuthProvider's clip-absorb merge
  // produces when one device still held samples.
  S().hydrateFromRemote({
    items: [...samples, { ...REAL, id: "real-2", createdAt: Date.now() } as WardrobeItem],
    outfits: [],
    calendar: [],
    profile: S().profile,
    theme: "light",
    draft: S().draft,
  });
  ok(!S().items.some(isSampleItem), "samples stripped on the way in");
  ok(S().items.length === 1, "only the real piece survives", `${S().items.length}`);

  // ...but a snapshot of ONLY samples is a genuine first run and must be left alone.
  S().hydrateFromRemote({
    items: samples,
    outfits: [],
    calendar: [],
    profile: S().profile,
    theme: "light",
    draft: S().draft,
  });
  ok(S().items.length === 8, "a samples-only snapshot is preserved", `${S().items.length}`);
}

console.log("\n5. clearSamples still works on its own, and is idempotent");
{
  seedSamples();
  S().clearSamples();
  ok(S().items.length === 0, "manual clear empties a samples-only closet");
  S().clearSamples();
  ok(S().items.length === 0, "second call is a no-op");
}

console.log("\n6. AJA-279 — a brand-new closet is EMPTY, never pre-filled with samples");
{
  // The store's own initial state, before anything seeds or hydrates. Samples used to be filed
  // here as if they were the user's clothes; the demo now lives inside onboarding instead.
  const fresh = useWardrobe.getInitialState();
  ok(fresh.items.length === 0, "no starter items", `${fresh.items.length}`);
  ok(fresh.outfits.length === 0, "no starter outfits", `${fresh.outfits.length}`);
  ok(
    !("seedSampleCloset" in fresh),
    "the seeding action is gone, so nothing can re-fill a closet",
  );
}

console.log("\n7. AJA-279 — the look count stays honest, and both screens share it");
{
  const p = (category: string) => ({ category });
  ok(
    distinctLookCount([p("top"), p("top"), p("bottom"), p("bottom"), p("shoes"), p("shoes")]) === 4,
    "2 tops x 2 bottoms = 4, and the 2 pairs of shoes do NOT make it 8",
  );
  ok(
    distinctLookCount([p("top"), p("bottom"), p("shoes"), p("shoes"), p("shoes")]) === 1,
    "extra shoes never add a look",
  );
  ok(distinctLookCount([p("top"), p("top"), p("shoes")]) === 0, "no bottom, no look");
  ok(
    distinctLookCount([p("dress"), p("top"), p("bottom")]) === 2,
    "a dress is a complete look, so it adds rather than multiplies",
  );
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`}\n`);
process.exit(fails === 0 ? 0 : 1);
