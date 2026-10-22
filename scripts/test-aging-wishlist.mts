/**
 * AJA-286 — unit gate for src/lib/aging-wishlist.ts (`pickAgingNudge`).
 *
 * Run: npm run test:aging
 *
 * The live cron dry-run only exercises the empty path (no user currently has a
 * qualifying save), so this proves the actual selection + copy on synthetic
 * wardrobes: it must pick the most-overdue saved piece that we can *truthfully*
 * say duplicates something owned, and skip everything else (too new, too old,
 * already decided, or no owned look-alike). No network, no db.
 */
import { pickAgingNudge, AGING_DEFAULTS } from "@/lib/aging-wishlist";
import type { Category, WardrobeItem } from "@/lib/types";

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const NOW = Date.UTC(2026, 7, 9);
const daysAgo = (n: number) => NOW - n * 86_400_000;

let seq = 0;
const it = (p: Partial<WardrobeItem> & { category: Category }): WardrobeItem =>
  ({
    id: p.id ?? `i${++seq}`,
    name: p.name ?? "Item",
    category: p.category,
    color: p.color ?? "#1e2a3a",
    colorName: p.colorName ?? "navy",
    tags: p.tags ?? [],
    seasons: p.seasons ?? ["spring", "summer", "fall", "winter"],
    wishlist: p.wishlist ?? false,
    createdAt: p.createdAt ?? daysAgo(1),
    price: p.price,
  }) as WardrobeItem;

// Two owned tops sharing occasion tags — the "you already own N like it" the copy needs.
const owned1 = it({ id: "o1", category: "top", tags: ["work", "casual"] });
const owned2 = it({ id: "o2", category: "top", tags: ["work", "casual"] });

// 1 — happy path: an aged, undecided save that duplicates the owned tops.
const savedTop = it({ id: "w1", name: "Navy Oxford shirt", category: "top", tags: ["work", "casual"], wishlist: true, createdAt: daysAgo(35) });
const c1 = pickAgingNudge([owned1, owned2, savedTop], new Set(), NOW, AGING_DEFAULTS);
ok(!!c1 && c1.item.id === "w1", "picks the aged, redundant saved top");
ok(!!c1 && c1.redundantCount >= 1, "reports redundantCount ≥ 1", `got ${c1?.redundantCount}`);
ok(!!c1 && c1.ageDays === 35, "computes ageDays", `got ${c1?.ageDays}`);
ok(!!c1 && /already own/.test(c1.body) && c1.body.includes("Navy Oxford shirt"), "copy leads with the closet + names the item", c1?.body);
ok(!!c1 && !/sold out|selling|hurry|last one|price|% off/i.test(c1.body), "no urgency/price framing", c1?.body);

// 2 — too new: saved 5 days ago, before the reflection window.
ok(pickAgingNudge([owned1, owned2, it({ id: "w2", category: "top", tags: ["work", "casual"], wishlist: true, createdAt: daysAgo(5) })], new Set(), NOW) === null, "skips a too-new save");

// 3 — already decided: id is in the Decision bank.
ok(pickAgingNudge([owned1, owned2, savedTop], new Set(["w1"]), NOW) === null, "skips an already-decided item");

// 4 — no owned look-alike: aged, but nothing owned duplicates it → say nothing (v1).
ok(pickAgingNudge([owned1, owned2, it({ id: "w3", category: "bag", tags: ["evening"], wishlist: true, createdAt: daysAgo(40) })], new Set(), NOW) === null, "skips an aged save with no owned look-alike");

// 5 — too old: past maxDays, reads as clutter not a decision.
ok(pickAgingNudge([owned1, owned2, it({ id: "w4", category: "top", tags: ["work", "casual"], wishlist: true, createdAt: daysAgo(200) })], new Set(), NOW) === null, "skips a stale (> maxDays) save");

// 6 — most-overdue wins when several qualify.
const s35 = it({ id: "w5", name: "A", category: "top", tags: ["work", "casual"], wishlist: true, createdAt: daysAgo(35) });
const s60 = it({ id: "w6", name: "B", category: "top", tags: ["work", "casual"], wishlist: true, createdAt: daysAgo(60) });
const c6 = pickAgingNudge([owned1, owned2, s35, s60], new Set(), NOW);
ok(!!c6 && c6.item.id === "w6", "picks the most-overdue (oldest) candidate", `got ${c6?.item.id}`);

// 7 — an owned (non-wishlist) aged item is never a candidate.
ok(pickAgingNudge([owned1, owned2], new Set(), NOW) === null, "never nudges an owned (non-wishlist) item");

// 8 — the test path (minRedundant=0, relaxed age) forces a candidate from any saved piece, with
// neutral copy (no false "you already own N").
const soloBag = it({ id: "w7", name: "Clutch", category: "bag", tags: ["evening"], wishlist: true, createdAt: daysAgo(40) });
const cTest = pickAgingNudge([owned1, owned2, soloBag], new Set(), NOW, { minDays: 0, maxDays: 365, minRedundant: 0 });
ok(!!cTest && cTest.item.id === "w7", "test path (minRedundant=0) forces a candidate", `got ${cTest?.item.id}`);
ok(
  !!cTest && cTest.redundantCount === 0 && /still on your list/.test(cTest.body) && !/already own/.test(cTest.body),
  "neutral copy when there's no look-alike",
  cTest?.body,
);

console.log(fails === 0 ? "\nAll aging-wishlist checks passed." : `\n${fails} FAILED.`);
process.exit(fails ? 1 : 0);
