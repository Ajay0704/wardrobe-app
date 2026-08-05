/**
 * One-time migration (AJA-277): convert the OLD photographic starter closet in existing
 * snapshots into the new drawn one, in place.
 *
 * WHY REWRITE RATHER THAN DELETE. The stored items carry the photo URL and the fabricated data
 * baked into the JSON (`wearCount` up to 19, a `lastWornAt` earlier than their own `createdAt`,
 * `favorite: true`), so shipping the new drawings does not fix anyone already carrying the old
 * ones. Deleting would have worked, but four users have NOTHING except samples, and
 * `seedSampleCloset` refuses to seed an empty closet (`if (s.items.length === 0) return s`) —
 * so deleting would leave them opening the app to a blank screen with no starter closet at all.
 *
 * Sample ids are identical between the photo and drawing capsules, so the honest fix is to
 * re-point each one: swap the image for the sketch, drop the invented wear history, and clear
 * the beautify mirror-fields (a drawing is not a processed photo).
 *
 * It also does an integrity pass, because production already contains the exact damage the
 * old one-at-a-time deletion caused: one user has three sample OUTFITS whose items were deleted
 * individually and never cleaned up. Dangling references are pruned from outfits, the calendar
 * and the builder draft.
 *
 * DRY RUN BY DEFAULT — the snapshot is live data.
 *   node --env-file=.env.local scripts/clear-demo-items.mjs           # look, don't touch
 *   node --env-file=.env.local scripts/clear-demo-items.mjs --apply   # write
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Sample slug → drawing, mirroring the `sketch(...)` calls in src/lib/demo-data.ts. Duplicated
 * deliberately: this is a one-shot script and importing TS through the loader for a 14-entry map
 * is not worth the coupling. If a slug is missing (older capsules had different pieces), the
 * fallback below derives one from the item's own category, so nothing is left holding a photo.
 */
const BY_SLUG = {
  "white-shirt": "shirt",
  "white-oxford": "shirt",
  "camel-sweater": "sweater",
  "navy-sweater": "sweater",
  "grey-tee": "tee",
  "blue-jeans": "jeans",
  "dark-jeans": "jeans",
  chinos: "chinos",
  trousers: "trousers",
  "trench-coat": "coat",
  "field-jacket": "jacket",
  "black-dress": "dress",
  loafers: "loafers",
  "white-sneakers": "sneakers",
};
const BY_CATEGORY = {
  top: "tee",
  bottom: "trousers",
  dress: "dress",
  outerwear: "jacket",
  shoes: "sneakers",
  // Drawn rather than mapped to a garment: the legacy capsule (ids demo-1..demo-14) contains a
  // bag and an accessory, and showing either as a t-shirt would be a visible lie.
  accessory: "scarf",
  bag: "bag",
};

const isSample = (id) => typeof id === "string" && id.startsWith("demo-");
const arr = (v) => (Array.isArray(v) ? v : []);
const unmapped = new Set();

/** `demo-w-white-shirt` → `white-shirt` */
const slugOf = (id) => String(id).replace(/^demo-[wm]-/, "");

function drawingFor(item) {
  const slug = slugOf(item.id);
  const known = BY_SLUG[slug];
  if (known) return known;
  unmapped.add(`${slug} (${item.category ?? "?"})`);
  return BY_CATEGORY[item.category] ?? "tee";
}

function rewriteSample(item) {
  const drawing = drawingFor(item);
  const src = `/samples/sketch/${drawing}.svg`;
  const next = { ...item, imageUrl: src, cutoutImageUrl: src, beautifyModel: "sketch@1" };
  // A drawing is not a beautified photo. Leaving these set would make the editor treat it as a
  // real pipeline result, and "Standardize my closet" would try to re-render it.
  delete next.beautifiedImageUrl;
  delete next.beautifyWhiteUrl;
  // The fabrications. This is the actual point of the migration.
  delete next.wearCount;
  delete next.lastWornAt;
  delete next.favorite;
  return { next, drawing };
}

function clean(row) {
  const items = arr(row.items);
  const outfits = arr(row.outfits);
  const calendar = arr(row.calendar);
  const draft = row.draft && typeof row.draft === "object" ? row.draft : {};

  let rewritten = 0;
  let wearStripped = 0;
  const drawings = new Set();
  const newItems = items.map((it) => {
    if (!isSample(it?.id)) return it;
    if (it.wearCount !== undefined || it.lastWornAt !== undefined || it.favorite !== undefined) {
      wearStripped++;
    }
    const { next, drawing } = rewriteSample(it);
    drawings.add(drawing);
    rewritten++;
    return next;
  });

  const live = new Set(newItems.map((it) => it?.id).filter(Boolean));

  // Integrity pass: prune references to items that no longer exist, and drop a sample outfit
  // once nothing it pointed at survives.
  let outfitsDropped = 0;
  let outfitRefs = 0;
  let outfitWear = 0;
  const newOutfits = [];
  for (const o of outfits) {
    const ids = arr(o?.itemIds);
    const kept = ids.filter((id) => live.has(id));
    outfitRefs += ids.length - kept.length;
    if (isSample(o?.id) && kept.length === 0) {
      outfitsDropped++;
      continue;
    }
    const next = { ...o, itemIds: kept };
    if (isSample(o?.id) && (next.wearCount !== undefined || next.lastWornAt !== undefined)) {
      delete next.wearCount;
      delete next.lastWornAt;
      outfitWear++;
    }
    newOutfits.push(next);
  }
  const liveOutfits = new Set(newOutfits.map((o) => o?.id).filter(Boolean));

  let calRefs = 0;
  let calUnlinked = 0;
  const newCalendar = calendar.map((e) => {
    const ids = arr(e?.itemIds);
    const kept = ids.filter((id) => live.has(id));
    calRefs += ids.length - kept.length;
    const dead = e?.outfitId && !liveOutfits.has(e.outfitId);
    if (dead) calUnlinked++;
    const next = { ...e, itemIds: kept };
    if (dead) delete next.outfitId;
    return next;
  });

  let draftRefs = 0;
  const newDraft = Object.fromEntries(
    Object.entries(draft).map(([slot, ids]) => {
      const list = arr(ids);
      const kept = list.filter((id) => live.has(id));
      draftRefs += list.length - kept.length;
      return [slot, kept];
    }),
  );

  const changed =
    rewritten > 0 || outfitsDropped > 0 || outfitRefs > 0 || outfitWear > 0 ||
    calRefs > 0 || calUnlinked > 0 || draftRefs > 0;

  return {
    changed,
    rewritten,
    wearStripped,
    outfitsDropped,
    outfitWear,
    dangling: outfitRefs + calRefs + calUnlinked + draftRefs,
    realKept: newItems.filter((it) => !isSample(it?.id)).length,
    drawings: [...drawings].sort(),
    patch: { items: newItems, outfits: newOutfits, calendar: newCalendar, draft: newDraft },
  };
}

const { data: rows, error } = await db
  .from("wardrobe_snapshots")
  .select("user_id, items, outfits, calendar, draft");
if (error) {
  console.error("Read failed:", error.message);
  process.exit(1);
}

console.log(`\n${APPLY ? "APPLYING — writing to live snapshots" : "DRY RUN — nothing will be written"}`);
console.log(`${rows.length} snapshot rows\n`);
console.log("  user      →drawings  fake data  outfits  dangling  real kept  closet after");
console.log("  ────────  ─────────  ─────────  ───────  ────────  ─────────  ────────────");

const totals = { users: 0, rewritten: 0, wear: 0, outfits: 0, dangling: 0, real: 0 };
const writes = [];

for (const row of rows) {
  const c = clean(row);
  totals.real += c.realKept;
  if (!c.changed) continue;
  totals.users++;
  totals.rewritten += c.rewritten;
  totals.wear += c.wearStripped;
  totals.outfits += c.outfitsDropped;
  totals.dangling += c.dangling;
  console.log(
    `  ${String(row.user_id).slice(0, 8)}  ${String(c.rewritten).padStart(9)}  ` +
      `${String(c.wearStripped).padStart(9)}  ${String(-c.outfitsDropped || 0).padStart(7)}  ` +
      `${String(c.dangling).padStart(8)}  ${String(c.realKept).padStart(9)}  ` +
      `${c.realKept + c.rewritten} items (${c.rewritten} drawn)`,
  );
  writes.push({ user_id: row.user_id, patch: c.patch });
}

console.log(
  `\n  ${totals.users} users touched` +
    `\n  ${totals.rewritten} sample items re-pointed at drawings` +
    `\n  ${totals.wear} of them had invented wear history / favourites — stripped` +
    `\n  ${totals.outfits} sample outfits dropped (nothing they referenced survives)` +
    `\n  ${totals.dangling} dangling references pruned from outfits / calendar / draft` +
    `\n  ${totals.real} real items across all users — MUST be untouched` +
    `\n  0 users end up empty (that is the point of rewriting instead of deleting)\n`,
);
if (unmapped.size) {
  console.log(`  slugs with no drawing mapping, fell back to category: ${[...unmapped].join(", ")}\n`);
}

if (!APPLY) {
  console.log("  Re-run with --apply to write.\n");
  process.exit(0);
}

let done = 0;
for (const w of writes) {
  const { error: upErr } = await db
    .from("wardrobe_snapshots")
    .update({ ...w.patch, updated_at: new Date().toISOString() })
    .eq("user_id", w.user_id);
  if (upErr) {
    console.error(`  FAILED ${String(w.user_id).slice(0, 8)}: ${upErr.message}`);
    continue;
  }
  done++;
}
console.log(`\n  updated ${done}/${writes.length} rows\n`);
