/**
 * Step 4 of the onboarding-churn investigation: does the outfit engine actually
 * work at the closet sizes real users reach?
 *
 * Motivation. Our own production data (2026-08-04) says the median real closet
 * across 18 non-developer users is 0.5 items, only 2 users passed 10 items, and
 * the biggest non-developer closet is 11. Every strategy that says "make the
 * value land before the cataloguing finishes" depends on the engine producing
 * something worth seeing at 5-15 items. That has never been measured — the
 * existing harness (test-outfit-rules.mts) checks RULES on synthetic fixtures,
 * not YIELD as a function of closet size.
 *
 * Method. Subsample a real 173-item closet at increasing N, many trials each,
 * and measure four things:
 *   1. YIELD      — fraction of closets that return any look at all.
 *   2. COMPLETE   — fraction whose top look is a wearable outfit
 *                   (dress+shoes, or top+bottom+shoes).
 *   3. SLATE      — how many of the 3 requested looks come back distinct.
 *   4. LIFT       — median score vs a uniform-random valid pick from the SAME
 *                   closet. This is the benchmark matching.ts itself used to
 *                   retire the previous engine ("statistically indistinguishable
 *                   from picking at random, median 84 for both"), so it is the
 *                   established bar here. A high score with zero lift means the
 *                   scorer is measuring the closet, not the choice.
 *
 * Two capture strategies are compared at each N, because this is a design
 * question and not just a measurement:
 *   RANDOM   — user photographs whatever they grab (today's behaviour).
 *   GUIDED   — capture is steered to fill core slots first (a hypothetical
 *              onboarding that asks for tops, then bottoms, then shoes).
 *
 * Pure functions and local data: no network, no API spend.
 *
 * Run: npm run measure:closets
 */
import { readFileSync } from "node:fs";
import { suggestLooks } from "@/lib/matching";
import { rejectOutfit, scoreOutfitV2, type OutfitContext } from "@/lib/outfit-rules";
import type { Season, WardrobeItem } from "@/lib/types";

const POOL_PATH =
  process.env.POOL_PATH ??
  "/private/tmp/claude-501/-Users-ajaythirumurthi/2e292369-39d8-46aa-a86c-0eafbe689fb3/scratchpad/pool.json";

type Raw = {
  id: string;
  category: string;
  subcategory?: string | null;
  color?: string | null;
  seasons?: string[] | null;
  tags?: string[] | null;
  formality?: string | null;
  fit?: string | null;
  tone?: string | null;
  pattern?: string | null;
  material?: string | null;
  name?: string | null;
};

/**
 * The engine filters on `imageUrl` (suggestLooksV2 drops items without one), so
 * the fixture has to carry a placeholder or every closet yields nothing and the
 * whole run reads as a catastrophic failure that is really a fixture bug.
 */
function toItem(r: Raw): WardrobeItem {
  return {
    id: r.id,
    name: r.name ?? "",
    category: r.category,
    subcategory: r.subcategory ?? undefined,
    color: r.color ?? "#808080",
    seasons: (r.seasons ?? []) as Season[],
    tags: r.tags ?? [],
    formality: r.formality ?? undefined,
    fit: r.fit ?? undefined,
    tone: r.tone ?? undefined,
    pattern: r.pattern ?? undefined,
    material: r.material ?? undefined,
    imageUrl: `https://example.invalid/${r.id}.png`,
    wishlist: false,
    createdAt: new Date().toISOString(),
  } as unknown as WardrobeItem;
}

const pool: WardrobeItem[] = (JSON.parse(readFileSync(POOL_PATH, "utf8")) as Raw[]).map(toItem);

/** Deterministic PRNG so a re-run reproduces the table exactly. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleRandom(n: number, rnd: () => number): WardrobeItem[] {
  const copy = pool.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * GUIDED: round-robin across the core slots (top, bottom, shoes) before spending
 * any of the budget on outerwear or accessories. This is the cheapest possible
 * model of "ask for the things an outfit needs first".
 */
function sampleGuided(n: number, rnd: () => number): WardrobeItem[] {
  const byCat = new Map<string, WardrobeItem[]>();
  for (const it of pool) {
    const l = byCat.get(it.category) ?? [];
    l.push(it);
    byCat.set(it.category, l);
  }
  for (const l of byCat.values()) {
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
  }
  const order = ["top", "bottom", "shoes", "outerwear", "accessory"];
  const out: WardrobeItem[] = [];
  let ring = 0;
  while (out.length < n) {
    let placed = false;
    for (let k = 0; k < order.length && out.length < n; k++) {
      const cat = order[(ring + k) % 3 < 3 && ring < 3 ? k : k];
      const list = byCat.get(order[k]);
      if (!list?.length) continue;
      // Core slots get a turn every round; the extras only once the core three
      // each have two items, which is the minimum for any variety at all.
      const isCore = k < 3;
      const coreDone = ["top", "bottom", "shoes"].every(
        (c) => out.filter((o) => o.category === c).length >= 2,
      );
      if (!isCore && !coreDone) continue;
      out.push(list.shift()!);
      placed = true;
      void cat;
    }
    ring++;
    if (!placed) break;
  }
  return out;
}

function isWearable(items: WardrobeItem[]): boolean {
  const has = (c: string) => items.some((i) => i.category === c);
  return (has("dress") || (has("top") && has("bottom"))) && has("shoes");
}

/** Uniform-random valid pick — the control the previous engine failed against. */
function randomControl(closet: WardrobeItem[], ctx: OutfitContext, rnd: () => number) {
  const byCat = new Map<string, WardrobeItem[]>();
  for (const it of closet) {
    const l = byCat.get(it.category) ?? [];
    l.push(it);
    byCat.set(it.category, l);
  }
  const grab = (c: string) => {
    const l = byCat.get(c);
    return l?.length ? l[Math.floor(rnd() * l.length)] : null;
  };
  for (let tries = 0; tries < 60; tries++) {
    const picked = [grab("top"), grab("bottom"), grab("shoes")].filter(Boolean) as WardrobeItem[];
    if (picked.length < 2) return null;
    // Deliberately NOT filtered by rejectOutfit — the control is "pick at
    // random", and filtering it would smuggle the engine's own rules into the
    // baseline and understate the lift.
    return scoreOutfitV2(picked, ctx).score;
  }
  return null;
}

const SIZES = [3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 50, 100, 173];
const TRIALS = 400;
const CONTEXTS: { label: string; ctx: OutfitContext }[] = [
  { label: "summer", ctx: { season: "summer", tempC: 27, needsOuterwear: false } },
  { label: "winter", ctx: { season: "winter", tempC: 2, needsOuterwear: true } },
];

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

console.log(`pool: ${pool.length} real items`);
const counts = new Map<string, number>();
for (const i of pool) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
console.log("mix :", [...counts].map(([c, n]) => `${c}=${n}`).join(" "), "\n");

for (const { label, ctx } of CONTEXTS) {
  for (const strategy of ["RANDOM", "GUIDED"] as const) {
    console.log(`--- ${label} / ${strategy} capture`);
    console.log("   N   yield  wearable  slate/3   medScore   medRandom   lift");
    for (const n of SIZES) {
      if (n > pool.length) continue;
      let yielded = 0;
      let wearable = 0;
      let slateSum = 0;
      const scores: number[] = [];
      const ctrl: number[] = [];
      for (let t = 0; t < TRIALS; t++) {
        const rnd = mulberry32(n * 100003 + t * 31 + label.length);
        const closet = strategy === "RANDOM" ? sampleRandom(n, rnd) : sampleGuided(n, rnd);
        const looks = suggestLooks(closet, {
          count: 3,
          weather: {
            season: ctx.season as Season,
            needsOuterwear: ctx.needsOuterwear ?? false,
            tempC: ctx.tempC ?? undefined,
          },
          random: rnd,
        });
        if (looks.length) {
          yielded++;
          slateSum += looks.length;
          scores.push(looks[0].score);
          if (isWearable(looks[0].items)) wearable++;
        }
        const c = randomControl(closet, ctx, rnd);
        if (c != null) ctrl.push(c);
      }
      const ms = median(scores);
      const mc = median(ctrl);
      console.log(
        [
          String(n).padStart(4),
          `${((yielded / TRIALS) * 100).toFixed(0)}%`.padStart(7),
          `${((wearable / TRIALS) * 100).toFixed(0)}%`.padStart(9),
          (yielded ? slateSum / yielded : 0).toFixed(2).padStart(8),
          (Number.isNaN(ms) ? "-" : ms.toFixed(1)).padStart(10),
          (Number.isNaN(mc) ? "-" : mc.toFixed(1)).padStart(11),
          (Number.isNaN(ms) || Number.isNaN(mc) ? "-" : (ms - mc).toFixed(1)).padStart(6),
        ].join(""),
      );
    }
    console.log();
  }
}

/** Which single missing category costs the most, at the size users actually reach. */
console.log("--- what blocks a wearable look at N=10 (summer, RANDOM), 2000 trials");
const blockers = new Map<string, number>();
let ok10 = 0;
for (let t = 0; t < 2000; t++) {
  const rnd = mulberry32(777 + t);
  const closet = sampleRandom(10, rnd);
  const has = (c: string) => closet.some((i) => i.category === c);
  const looks = suggestLooks(closet, {
    count: 1,
    weather: { season: "summer", needsOuterwear: false, tempC: 27 },
    random: rnd,
  });
  if (looks.length && isWearable(looks[0].items)) {
    ok10++;
    continue;
  }
  const missing: string[] = [];
  if (!has("shoes")) missing.push("no shoes");
  if (!has("bottom")) missing.push("no bottom");
  if (!has("top") && !has("dress")) missing.push("no top");
  const key = missing.length ? missing.join(" + ") : "all slots present, rules rejected";
  blockers.set(key, (blockers.get(key) ?? 0) + 1);
}
console.log(`  wearable: ${((ok10 / 2000) * 100).toFixed(1)}%`);
for (const [k, v] of [...blockers].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${((v / 2000) * 100).toFixed(1)}%  ${k}`);
}

/**
 * Follow-up (2026-08-04): the guided sampler above fills top/bottom/shoes before
 * outerwear, which is right in warm weather and wrong in cold — rejectOutfit and
 * the `needsOuterwear` rule both want a coat below ~10C, so a cold-weather closet
 * without outerwear cannot produce a look no matter how many tops it has. This
 * decides a product question: how many pieces must the first-run ask collect to
 * clear the payoff threshold in WINTER, where an August-launched onboarding will
 * find most of its northern-hemisphere users by November.
 */
function sampleGuidedCold(n: number, rnd: () => number): WardrobeItem[] {
  const byCat = new Map<string, WardrobeItem[]>();
  for (const it of pool) {
    const l = byCat.get(it.category) ?? [];
    l.push(it);
    byCat.set(it.category, l);
  }
  for (const l of byCat.values()) {
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
  }
  // Outerwear promoted to 4th: one of each core slot, then the coat, then depth.
  const order = ["top", "bottom", "shoes", "outerwear", "top", "bottom", "shoes", "outerwear", "accessory"];
  const out: WardrobeItem[] = [];
  for (const cat of order) {
    if (out.length >= n) break;
    const list = byCat.get(cat);
    if (list?.length) out.push(list.shift()!);
  }
  while (out.length < n) {
    const list = [...byCat.values()].find((l) => l.length);
    if (!list) break;
    out.push(list.shift()!);
  }
  return out;
}

console.log("\n--- WINTER: how big must the first ask be? (400 trials each)");
console.log("   N   guided(core-first)   guided(coat-4th)");
for (const n of [4, 5, 6, 7, 8, 10]) {
  const res: number[] = [];
  for (const fn of [sampleGuided, sampleGuidedCold]) {
    let y = 0;
    for (let t = 0; t < 400; t++) {
      const rnd = mulberry32(n * 7919 + t * 13 + 5);
      const looks = suggestLooks(fn(n, rnd), {
        count: 1,
        weather: { season: "winter" as Season, needsOuterwear: true, tempC: 2 },
        random: rnd,
      });
      if (looks.length && isWearable(looks[0].items)) y++;
    }
    res.push((y / 400) * 100);
  }
  console.log(
    String(n).padStart(4) + `${res[0].toFixed(0)}%`.padStart(18) + `${res[1].toFixed(0)}%`.padStart(19),
  );
}
