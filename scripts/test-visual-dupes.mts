/**
 * AJA-301 — gate for visual duplicate detection in Should-I-Buy.
 *
 * Run: npm run test:visual-dupes
 *
 * "You own something very similar" used to mean same category + similar colour. With
 * image embeddings it means the pieces LOOK alike. This suite guards the parts that can
 * silently go wrong without anyone noticing a crash:
 *
 *  1. THE MATHS. Vectors are stored as int8 to stay small; similarity on the compressed
 *     form must track the real thing. A wrong-sized vector (the API returns 3072 dims
 *     when the size parameter is misplaced) must be rejected, not stored.
 *  2. STALENESS. A vector belongs to one image. Change the photo and the old vector
 *     must stop counting at once — the index is keyed by a hash of the source.
 *
 * Offline: CI has no Gemini key. Real-model behaviour is checked against vectors
 * captured by scripts/calibrate-visual-dupes.mts (section added with the fixture).
 */
const {
  VISUAL_DIM,
  cosine,
  decodeVector,
  makeVisualLookup,
  quantizeVector,
  srcHash,
  visualSource,
} = await import("@/lib/visual-similarity");
type WardrobeItem = import("@/lib/types").WardrobeItem;

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
/** A random unit-ish float vector, like a model output. */
const randVec = (seed: number, dim = VISUAL_DIM) => {
  const r = rng(seed);
  return Array.from({ length: dim }, () => r() * 2 - 1);
};
const floatCos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / Math.sqrt(na * nb);
};
/** Correlated pair: b = a + noise, so cosine lands mid-range, where thresholds live. */
const pairWithCos = (seed: number, noise: number) => {
  const a = randVec(seed);
  const n = randVec(seed + 1);
  return [a, a.map((x, i) => x + noise * n[i])];
};

const mk = (p: Partial<WardrobeItem> & { id: string }): WardrobeItem =>
  ({ name: p.id, category: "top", color: "#808080", tags: [], seasons: [], wishlist: false,
     imageUrl: "", createdAt: "2026-01-01T00:00:00.000Z", ...p }) as WardrobeItem;

// ---------------------------------------------------------------------------
console.log("\n=== 1. Compressed vectors keep their similarity ===");
let worst = 0;
for (let s = 0; s < 40; s++) {
  const [a, b] = pairWithCos(100 + s * 7, 0.4 + (s % 5) * 0.3);
  const qa = decodeVector(quantizeVector(a));
  const qb = decodeVector(quantizeVector(b));
  if (!qa || !qb) { worst = Infinity; break; }
  worst = Math.max(worst, Math.abs(cosine(qa, qb) - floatCos(a, b)));
}
ok(worst < 0.01, "int8 cosine stays within 0.01 of float cosine across 40 pairs", `worst Δ ${worst.toFixed(4)}`);

const v = randVec(7);
ok(quantizeVector(v) === quantizeVector(v.map((x) => x * 3)),
  "scale-invariant: a vector and 3× it compress identically (the model's norm is irrelevant)");

const unit = (i: number) => Array.from({ length: VISUAL_DIM }, (_, j) => (j === i ? 1 : 0));
const same = decodeVector(quantizeVector(unit(0)))!;
const opp = decodeVector(quantizeVector(unit(0).map((x) => -x)))!;
const orth = decodeVector(quantizeVector(unit(1)))!;
ok(Math.abs(cosine(same, same) - 1) < 1e-9, "identical → 1");
ok(Math.abs(cosine(same, opp) + 1) < 1e-9, "opposite → -1");
ok(Math.abs(cosine(same, orth)) < 1e-9, "orthogonal → 0");

ok(quantizeVector(randVec(3)).length === Math.ceil(VISUAL_DIM / 3) * 4,
  "stored form is base64 of exactly one byte per dimension", `${quantizeVector(randVec(3)).length} chars`);
ok(decodeVector(quantizeVector(randVec(3, 3072))) === null,
  "a 3072-dim vector (size parameter ignored by the API) is rejected, never stored");
ok(decodeVector(quantizeVector(randVec(3, 767))) === null, "one dimension short is rejected");
ok(decodeVector("not base64 at all!!") === null, "garbage decodes to null, not a throw");
ok(decodeVector("") === null, "empty decodes to null");

// ---------------------------------------------------------------------------
console.log("\n=== 2. Which image a piece is judged by ===");
ok(visualSource(mk({ id: "a", imageUrl: "https://x.test/full.jpg", cutoutImageUrl: "https://x.test/cut.png" }))
  === "https://x.test/cut.png", "the cut-out wins — beautified pieces keep an AI redraw in imageUrl");
ok(visualSource(mk({ id: "b", imageUrl: "https://x.test/full.jpg" })) === "https://x.test/full.jpg",
  "no cut-out → the main image");
ok(visualSource(mk({ id: "c", imageUrl: "data:image/png;base64,AAAA" })) === "data:image/png;base64,AAAA",
  "a data: image is usable (signed-out adds)");
ok(visualSource(mk({ id: "demo-w-white-shirt", imageUrl: "https://x.test/s.png" })) === null,
  "starter samples are never judged — they share line drawings, so every one would match");
for (const bad of ["", "blob:https://x.test/1", "/samples/x.png", "ftp://x.test/a.jpg", "javascript:alert(1)"]) {
  ok(visualSource(mk({ id: "d", imageUrl: bad })) === null, `unusable source rejected: ${JSON.stringify(bad) || "(empty)"}`);
}

// The route refuses a whole batch carrying an inline image over its cap, and the client
// would then back off all 16 pieces for an hour. So the client never picks one.
const { VISUAL_MAX_INLINE_CHARS } = await import("@/lib/visual-similarity");
ok(visualSource(mk({ id: "big", imageUrl: "data:image/png;base64," + "A".repeat(VISUAL_MAX_INLINE_CHARS) })) === null,
  "an inline image over the route's cap is never selected (one bad piece must not sink its batch)");
ok(visualSource(mk({ id: "ok", imageUrl: "data:image/png;base64," + "A".repeat(1000) })) !== null,
  "positive control: a normal inline image still is");

ok(srcHash("https://x.test/a.jpg") === srcHash("https://x.test/a.jpg"), "hash is stable");
ok(srcHash("https://x.test/a.jpg") !== srcHash("https://x.test/b.jpg"), "hash changes with the image");

// ---------------------------------------------------------------------------
console.log("\n=== 3. A vector only counts for the image it came from ===");
const shirt = mk({ id: "shirt", imageUrl: "https://x.test/shirt-v1.jpg" });
const vec = quantizeVector(randVec(11));
const lookup = makeVisualLookup({ shirt: { h: srcHash("https://x.test/shirt-v1.jpg"), v: vec } });
ok(lookup(shirt) !== null, "positive control: the matching image's vector is returned");
ok(lookup({ ...shirt, imageUrl: "https://x.test/shirt-v2.jpg" }) === null,
  "photo changed → the old vector is ignored immediately");
ok(lookup(mk({ id: "other", imageUrl: "https://x.test/shirt-v1.jpg" })) === null, "no entry → null");
ok(makeVisualLookup({ shirt: { h: srcHash("https://x.test/shirt-v1.jpg"), v: "broken" } })(shirt) === null,
  "a corrupt stored vector → null, not a crash");

// ---------------------------------------------------------------------------
console.log("\n=== 4. Should-I-Buy judges what the pieces look like ===");
// Real Gemini Embedding 2 vectors for the public sample garments, captured by
// scripts/calibrate-visual-dupes.mts: each garment on white (a retailer shot — the wish)
// and as a cut-out (a closet piece). So these checks run the real model's behaviour,
// offline, against the threshold that ships.
const fs = await import("node:fs");
const path = await import("node:path");
const { VISUAL_DUP_COS } = await import("@/lib/visual-similarity");
const { analyzeSmartBuy } = await import("@/lib/smart-buy");
const fx = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/visual-samples.json"), "utf8")) as {
  garments: Record<string, { category: string; color: string; name: string }>;
  vectors: Record<string, string>;
};
const urlOf = (key: string) => `https://x.test/${key}.png`;
const entries: Record<string, { h: string; v: string }> = {};
/** A piece made from a sample rendering; `as` overrides its fields for a scenario. */
const piece = (slug: string, kind: "white" | "sticker", as: Partial<WardrobeItem> = {}) => {
  const key = `${slug}-${kind}`;
  const g = fx.garments[slug];
  const it = mk({ id: `${key}${as.wishlist ? "-wish" : ""}`, name: g.name, category: g.category as WardrobeItem["category"],
    color: g.color, imageUrl: urlOf(key), wishlist: kind === "white", ...as });
  entries[it.id] = { h: srcHash(urlOf(key)), v: fx.vectors[key] };
  return it;
};
const visual = makeVisualLookup(entries);
const cosOf = (a: WardrobeItem, b: WardrobeItem) => cosine(visual(a)!, visual(b)!);
const flagged = (wish: WardrobeItem, owned: WardrobeItem[], useVisual = true) =>
  analyzeSmartBuy(wish, [...owned, wish], useVisual ? { visual } : {}).redundant.map((o) => o.id);

const sneakW = piece("women/white-sneakers", "white");
const sneakM = piece("men/white-sneakers", "sticker");
ok(flagged(sneakW, [sneakM]).includes(sneakM.id),
  "a second pair of white sneakers is flagged — retailer shot vs closet cut-out, different shoes",
  `cos ${cosOf(sneakW, sneakM).toFixed(3)}`);
const shirtW = piece("women/white-shirt", "white");
const shirtS = piece("women/white-shirt", "sticker");
ok(flagged(shirtW, [shirtS]).includes(shirtS.id), "the same shirt in two formats is flagged", `cos ${cosOf(shirtW, shirtS).toFixed(3)}`);

// The veto. Taupe trousers and olive chinos look alike to the model — above the
// threshold — but their colours plainly differ. Precondition first, or the check is idle.
const taupe = piece("women/trousers", "white");
const olive = piece("men/chinos", "sticker");
ok(cosOf(taupe, olive) >= VISUAL_DUP_COS, "precondition: the model scores taupe trousers vs olive chinos above the threshold",
  `cos ${cosOf(taupe, olive).toFixed(3)} ≥ ${VISUAL_DUP_COS}`);
ok(!flagged(taupe, [olive]).includes(olive.id), "…and the colour veto stops it being called a duplicate");

// Visual replaces the heuristic where it can. Tag a grey tee and a white oxford with the
// SAME colour: the heuristic calls that a duplicate; the pictures say otherwise.
const oxfordWish = piece("men/white-oxford", "white", { color: "#eeeeee" });
const teeOwned = piece("men/grey-tee", "sticker", { color: "#eeeeee" });
ok(cosOf(oxfordWish, teeOwned) < VISUAL_DUP_COS, "precondition: a tee and an oxford look different to the model",
  `cos ${cosOf(oxfordWish, teeOwned).toFixed(3)}`);
ok(flagged(oxfordWish, [teeOwned], false).includes(teeOwned.id), "without vectors the heuristic flags them (same colour tag)");
ok(!flagged(oxfordWish, [teeOwned]).includes(teeOwned.id), "with vectors they are not — what they look like wins");

// Unknown colour (the wishlist add paths stamp #a8a29e) must not veto: no colour, no claim.
const sneakUnknown = piece("women/white-sneakers", "white", { id: "sneak-unknown", color: "#a8a29e" });
entries[sneakUnknown.id] = { h: srcHash(urlOf("women/white-sneakers-white")), v: fx.vectors["women/white-sneakers-white"] };
ok(flagged(sneakUnknown, [sneakM]).includes(sneakM.id), "an unknown colour defers to the picture instead of vetoing");

// Mixed closets: a piece with no vector yet falls back to the heuristic, pair by pair.
const navyA = mk({ id: "navy-a", category: "top", color: "#1e3a5f", imageUrl: "https://x.test/no-vector.png" });
const mixed = analyzeSmartBuy(oxfordWish, [teeOwned, navyA, oxfordWish], { visual });
ok(mixed.redundantBasis === "mixed", "a closet half-embedded reports a mixed basis", mixed.redundantBasis);
ok(analyzeSmartBuy(sneakW, [sneakM, sneakW], { visual }).redundantBasis === "visual", "all pairs embedded → visual basis");
ok(analyzeSmartBuy(sneakW, [sneakM, sneakW]).redundantBasis === "heuristic", "no lookup → heuristic basis");

// The wishlist grid says it too: "You already own one of these" must follow the pictures,
// or the card and the sheet would disagree about the same wish.
const { wishVerdict } = await import("@/lib/wishlist-plan");
ok(wishVerdict(oxfordWish, [teeOwned, oxfordWish], []).redundantCount === 1 &&
   wishVerdict(oxfordWish, [teeOwned, oxfordWish], [], visual).redundantCount === 0,
  "the wishlist card's verdict uses the pictures when it has them");

// The type gate holds on the visual path too: precision first.
const asLoafer = piece("men/white-sneakers", "sticker", { id: "typed-loafer", subcategory: "loafers" });
entries[asLoafer.id] = entries[sneakM.id];
ok(!flagged({ ...sneakW, subcategory: "sneakers" }, [asLoafer]).includes(asLoafer.id),
  "two different garment types are never duplicates, whatever the picture says");

// ---------------------------------------------------------------------------
console.log("\n=== 5. The captured vectors still separate at the shipped threshold ===");
// Every same-category pair in the fixture: near-duplicates must clear the threshold and
// every other pair must stay out (directly, or via the colour veto).
const near = new Set(["men/white-oxford|women/white-shirt", "men/white-sneakers|women/white-sneakers"]);
const slugs = Object.keys(fx.garments);
let wrong = 0;
let checked = 0;
for (let i = 0; i < slugs.length; i++) {
  for (let j = i; j < slugs.length; j++) {
    const [a, b] = [slugs[i], slugs[j]];
    if (fx.garments[a].category !== fx.garments[b].category) continue;
    const wish = piece(a, "white");
    const own = piece(b, "sticker");
    const isDupe = a === b || near.has([a, b].sort().join("|"));
    checked++;
    if (flagged(wish, [own]).includes(own.id) !== isDupe) {
      wrong++;
      console.log(`     ${isDupe ? "MISSED" : "FALSE "}  ${fx.garments[a].name} vs ${fx.garments[b].name}  cos ${cosOf(wish, own).toFixed(3)}`);
    }
  }
}
ok(checked > 30 && wrong === 0, "every same-category sample pair is judged right", `${checked - wrong}/${checked}`);

console.log(`\n${fails === 0 ? "VISUAL DUPE CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
