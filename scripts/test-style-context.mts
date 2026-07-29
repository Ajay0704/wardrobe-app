/**
 * AJA-258 — gate for src/lib/style-context.ts and its persistence.
 *
 * Run: npm run test:context
 *
 * The important half is the ROUND TRIP through the real store. Adding a field to
 * the store without adding it to `partialize` has silently dropped work four times
 * (AJA-223 / 239 / 244 / 245), and a normalizer that nobody wired into `merge` is
 * just as useless as no normalizer. So this drives the real zustand persist
 * config — writes through the real setter, reads the real localStorage payload,
 * and re-hydrates a deliberately corrupt blob through the real merge.
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

const {
  DEFAULT_STYLE_CONTEXT,
  TEMP_MAX,
  TEMP_MIN,
  describeStyleContext,
  normalizeStyleContext,
  resolveStyleContext,
} = await import("@/lib/style-context");
const { useWardrobe } = await import("@/lib/store");
const { rejectOutfit } = await import("@/lib/outfit-rules");
type StyleContext = import("@/lib/style-context").StyleContext;
type WardrobeItem = import("@/lib/types").WardrobeItem;
type Category = import("@/lib/types").Category;

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const PERSIST_KEY = "wardrobe-store-v2";

// ---------------------------------------------------------------------------
console.log("\n=== 1. normalize rejects everything it should ===");

ok(normalizeStyleContext(undefined).mode === "auto", "undefined -> auto default");
ok(normalizeStyleContext(null).mode === "auto", "null -> auto default");
ok(normalizeStyleContext("manual").mode === "auto", "a bare string -> auto default");
ok(normalizeStyleContext(42).season === DEFAULT_STYLE_CONTEXT.season, "a number -> defaults");
ok(normalizeStyleContext({ season: "banana" }).season === DEFAULT_STYLE_CONTEXT.season,
  "an invalid season falls back", normalizeStyleContext({ season: "banana" }).season);
ok(normalizeStyleContext({ occasion: "brunch" }).occasion === "everyday",
  "an occasion outside STYLE_OCCASIONS falls back");
ok(normalizeStyleContext({ occasion: "nights_out" }).occasion === "nights_out",
  "a real STYLE_OCCASIONS id is kept");
// typeof NaN === "number", so a naive typeof guard would let this through and the
// engine would compare NaN >= 20 (always false) and silently lose the thermal rule.
ok(normalizeStyleContext({ tempC: NaN }).tempC === DEFAULT_STYLE_CONTEXT.tempC,
  "NaN temperature falls back (typeof would have accepted it)");
ok(normalizeStyleContext({ tempC: Infinity }).tempC === DEFAULT_STYLE_CONTEXT.tempC,
  "Infinity temperature falls back");
ok(normalizeStyleContext({ tempC: 999 }).tempC === TEMP_MAX, "temperature clamps high", String(TEMP_MAX));
ok(normalizeStyleContext({ tempC: -999 }).tempC === TEMP_MIN, "temperature clamps low", String(TEMP_MIN));
ok(normalizeStyleContext({ tempC: 21.7 }).tempC === 22, "temperature rounds");
ok(normalizeStyleContext({ needsOuterwear: "yes" }).needsOuterwear === false,
  "a truthy non-boolean coat flag is NOT accepted as true");
// With a base, an invalid field falls back to the CURRENT value, not the global
// default — one bad field must not quietly reset the others.
const base: StyleContext = { mode: "manual", season: "winter", occasion: "work", tempC: 3, needsOuterwear: true };
ok(normalizeStyleContext({ season: "banana" }, base).season === "winter",
  "with a base, an invalid season keeps the current one rather than resetting");
ok(normalizeStyleContext({ tempC: NaN }, base).tempC === 3, "…same for temperature");
ok(normalizeStyleContext({ season: "spring" }, base).season === "spring", "…and a valid value still wins");
ok(normalizeStyleContext({ mode: "manual", season: "winter", occasion: "work", tempC: 3, needsOuterwear: true })
  .mode === "manual", "a valid object survives intact");

// ---------------------------------------------------------------------------
console.log("\n=== 2. resolve ===");

const AMB = { season: "summer" as const, tempC: 27, needsOuterwear: false };
const manual: StyleContext = { mode: "manual", season: "winter", occasion: "work", tempC: 3, needsOuterwear: true };

const rAuto = resolveStyleContext({ ...DEFAULT_STYLE_CONTEXT }, AMB, "nights_out");
ok(rAuto.source === "auto" && rAuto.season === "summer" && rAuto.weather?.tempC === 27,
  "auto mode reports the detected weather", JSON.stringify(rAuto.weather));
ok(rAuto.occasion === "nights_out" && rAuto.vibe === "party",
  "auto mode uses the quiz occasion and maps it to a vibe", `${rAuto.occasion}/${rAuto.vibe}`);

const rMan = resolveStyleContext(manual, AMB, "nights_out");
ok(rMan.source === "manual" && rMan.season === "winter" && rMan.weather?.tempC === 3,
  "manual mode overrides the detected weather entirely", JSON.stringify(rMan.weather));
ok(rMan.weather?.needsOuterwear === true, "…including the coat flag");
ok(rMan.occasion === "work" && rMan.vibe === "work",
  "…and ignores the quiz occasion", `${rMan.occasion}/${rMan.vibe}`);

const rNone = resolveStyleContext({ ...DEFAULT_STYLE_CONTEXT }, null, "everyday");
ok(rNone.weather === null && rNone.season === undefined && rNone.source === "none",
  "auto with no cached weather yields NO season — today's real behaviour");
// The point of the whole feature: manual mode is the fix for that hole.
ok(resolveStyleContext(manual, null).season === "winter",
  "manual mode still gives the engine a season when no weather was ever detected");
ok(resolveStyleContext(undefined, AMB).source === "auto",
  "a missing context object behaves as auto, never as a crash");

ok(describeStyleContext({ ...DEFAULT_STYLE_CONTEXT }) === "Auto", "summary reads 'Auto' in auto mode");
ok(describeStyleContext(manual).includes("winter") && describeStyleContext(manual).includes("coat"),
  "summary names the override", describeStyleContext(manual));

// ---------------------------------------------------------------------------
console.log("\n=== 3. round trip through the REAL store ===");

useWardrobe.getState().setStyleContext({ mode: "manual", season: "winter", occasion: "work", tempC: 3, needsOuterwear: true });
const live = useWardrobe.getState().styleContext;
ok(live.mode === "manual" && live.season === "winter" && live.tempC === 3,
  "the setter patches live state", JSON.stringify(live));

const raw = store.get(PERSIST_KEY);
ok(!!raw, "the store actually wrote to localStorage");
const persisted = raw ? JSON.parse(raw).state : {};
// THE trap. `partialize` is a hand-written whitelist; a field missing from it is
// silently dropped on reload with no error anywhere.
ok(!!persisted.styleContext, "styleContext survives `partialize` (the AJA-223/239/244/245 trap)",
  JSON.stringify(persisted.styleContext));
ok(persisted.styleContext?.season === "winter" && persisted.styleContext?.tempC === 3,
  "…with the right values");

// A patch must not wipe the untouched fields.
useWardrobe.getState().setStyleContext({ tempC: 8 });
const patched = useWardrobe.getState().styleContext;
ok(patched.season === "winter" && patched.occasion === "work" && patched.tempC === 8,
  "a partial patch leaves the other fields alone", JSON.stringify(patched));

// The setter must sanitise too, not just `merge`.
useWardrobe.getState().setStyleContext({ tempC: NaN, season: "banana" as never });
const cleaned = useWardrobe.getState().styleContext;
ok(Number.isFinite(cleaned.tempC) && cleaned.season === "winter" && cleaned.tempC === 8,
  "the setter rejects bad fields and KEEPS the previous good ones (no silent reset)",
  JSON.stringify(cleaned));

// Now the merge path: hand-write a corrupt blob and re-hydrate through the real config.
store.set(
  PERSIST_KEY,
  JSON.stringify({
    version: 0,
    state: { styleContext: { mode: "manual", season: "banana", occasion: "brunch", tempC: "hot", needsOuterwear: "yes" } },
  }),
);
await useWardrobe.persist.rehydrate();
const rehydrated = useWardrobe.getState().styleContext;
ok(rehydrated.season !== "banana" && Number.isFinite(rehydrated.tempC) && rehydrated.needsOuterwear === false,
  "a corrupt persisted blob is normalized by `merge`, not handed to the engine",
  JSON.stringify(rehydrated));
ok(rehydrated.mode === "manual", "…while still honouring the parts that were valid");

// ---------------------------------------------------------------------------
console.log("\n=== 4. the override actually reaches the rules ===");
// Wiring a value through is not the same as it taking effect, so drive the real
// filter with the real resolver output.
const it = (p: Partial<WardrobeItem> & { category: Category }): WardrobeItem =>
  ({ id: p.name ?? "x", name: p.name ?? "", category: p.category, color: "#333", seasons: [], tags: [], createdAt: 0, ...p }) as WardrobeItem;
const look = [
  it({ category: "top", subcategory: "sweater", name: "Wool jumper" }),
  it({ category: "bottom", subcategory: "jeans", name: "Dark jeans" }),
  it({ category: "shoes", subcategory: "boots", name: "Chelsea boots" }),
  it({ category: "accessory", subcategory: "scarf", name: "Knit scarf", seasons: ["fall", "winter"] }),
];
const asCtx = (r: ReturnType<typeof resolveStyleContext>) => ({
  season: r.season,
  tempC: r.weather?.tempC ?? null,
  needsOuterwear: r.weather?.needsOuterwear,
});
const coldOverride = resolveStyleContext(
  { mode: "manual", season: "winter", occasion: "everyday", tempC: 2, needsOuterwear: true }, null);
const warmOverride = resolveStyleContext(
  { mode: "manual", season: "winter", occasion: "everyday", tempC: 27, needsOuterwear: true }, null);
ok(rejectOutfit(look, asCtx(coldOverride)) === null,
  "a manual cold winter allows the scarf", String(rejectOutfit(look, asCtx(coldOverride))));
ok(rejectOutfit(look, asCtx(warmOverride)) === "knit accessory in warm weather",
  "a manual winter at 27°C rejects it — phase 1 and phase 2 join up",
  String(rejectOutfit(look, asCtx(warmOverride))));

console.log(`\n${fails === 0 ? "STYLE-CONTEXT CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
