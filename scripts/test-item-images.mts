/**
 * AJA-283 — the image sweep that runs when an item is deleted.
 *
 * Run: npm run test:item-images
 *
 * `deleteItem` used to drop the record and leave the blob. On a real account that had
 * reached 890 orphans / 509 MB against 547 live images, in a bucket that is PUBLIC —
 * so an orphan stays fetchable by URL to anyone who had one.
 *
 * The decision (`orphanedItemPaths`) is pure, so both guards are tested here without a
 * Storage client. What is NOT covered: that the remove() call itself succeeds under RLS.
 *
 * NON-VACUITY: every "must NOT be deleted" case is paired with a positive control on the
 * same input shape. Without that, a helper that returned [] unconditionally — which is
 * precisely the bug being fixed — would pass every negative assertion.
 */
import { bucketPathFromUrl, itemImagePaths, orphanedItemPaths } from "@/lib/supabase/storage";

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fails++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};
const same = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

const UID = "4cea3e46-1111-2222-3333-444455556666";
const OTHER = "99999999-aaaa-bbbb-cccc-dddddddddddd";
const pub = (p: string) =>
  `https://xyz.supabase.co/storage/v1/object/public/wardrobe-images/${p}`;

console.log("\n=== bucketPathFromUrl ===");
ok(bucketPathFromUrl(pub(`${UID}/a.jpg`)) === `${UID}/a.jpg`, "public URL -> path");
ok(bucketPathFromUrl(pub(`${UID}/a.jpg`) + "?width=200") === `${UID}/a.jpg`, "query string stripped");
ok(bucketPathFromUrl(pub(`${UID}/a%20b.jpg`)) === `${UID}/a b.jpg`, "percent-encoding decoded");
ok(bucketPathFromUrl("data:image/png;base64,AAAA") === null, "data URL -> null");
ok(bucketPathFromUrl("https://shop.example.com/tee.jpg") === null, "remote product image -> null");
ok(
  bucketPathFromUrl("https://xyz.supabase.co/storage/v1/object/public/renders-private/x.jpg") === null,
  "a DIFFERENT bucket is never touched",
);
ok(bucketPathFromUrl(undefined) === null, "undefined -> null");
ok(bucketPathFromUrl(42) === null, "non-string -> null");

console.log("\n=== itemImagePaths ===");
const four = {
  id: "i1",
  imageUrl: pub(`${UID}/one.jpg`),
  beautifiedImageUrl: pub(`${UID}/two.png`),
  beautifyWhiteUrl: pub(`${UID}/three.png`),
  cutoutImageUrl: pub(`${UID}/four.png`),
};
ok(itemImagePaths(four).length === 4, "collects all four variant slots", String(itemImagePaths(four).length));
ok(
  itemImagePaths({ id: "i", imageUrl: pub(`${UID}/x.jpg`), cutoutImageUrl: pub(`${UID}/x.jpg`) }).length === 1,
  "the same path in two slots is deduped",
);
ok(
  itemImagePaths({ id: "i", imageUrl: "data:image/png;base64,AA", productUrl: pub(`${UID}/n.jpg`) }).length === 0,
  "ignores data URLs, and fields that are not image slots",
);

console.log("\n=== orphanedItemPaths — positive control first ===");
const mine = { id: "i1", imageUrl: pub(`${UID}/mine.jpg`) };
ok(
  same(orphanedItemPaths(mine, UID, []), [`${UID}/mine.jpg`]),
  "an unshared image of mine IS swept (control: the helper does something)",
);

console.log("\n=== guard 1: ownership ===");
const theirs = { id: "i2", imageUrl: pub(`${OTHER}/theirs.jpg`) };
ok(orphanedItemPaths(theirs, UID, []).length === 0, "another user's path is never swept");
// The prefix attack: `${UID}x/` startsWith `${UID}` but is a different folder.
const lookalike = { id: "i3", imageUrl: pub(`${UID}x/sneaky.jpg`) };
ok(
  orphanedItemPaths(lookalike, UID, []).length === 0,
  "a folder that merely STARTS WITH my id is not mine",
  `${UID}x/`,
);
ok(orphanedItemPaths(mine, null, []).length === 0, "signed out sweeps nothing");

console.log("\n=== guard 2: sharing ===");
const shared = pub(`${UID}/shared.jpg`);
const a = { id: "a", imageUrl: shared };
const b = { id: "b", imageUrl: shared };
ok(
  orphanedItemPaths(a, UID, [b]).length === 0,
  "a path a surviving item still uses is KEPT (duplicate / re-import)",
);
ok(
  same(orphanedItemPaths(a, UID, []), [`${UID}/shared.jpg`]),
  "…and the same path IS swept once nothing else points at it",
);
ok(
  same(orphanedItemPaths(a, UID, [{ ...a }]), [] as string[]) === false ||
    same(orphanedItemPaths(a, UID, [{ ...a }]), [`${UID}/shared.jpg`]),
  "the item being deleted does not count as its own survivor (matched by id)",
);
// Mixed: one variant shared, one not — only the free one goes.
const mixed = { id: "m", imageUrl: shared, cutoutImageUrl: pub(`${UID}/only-mine.png`) };
ok(
  same(orphanedItemPaths(mixed, UID, [b]), [`${UID}/only-mine.png`]),
  "with one variant shared and one free, exactly the free one is swept",
  orphanedItemPaths(mixed, UID, [b]).join(","),
);

console.log(`\n${fails === 0 ? "ALL ITEM-IMAGE CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
process.exit(fails ? 1 : 0);
