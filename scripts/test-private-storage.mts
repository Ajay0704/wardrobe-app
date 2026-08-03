/**
 * AJA-275 — guards for the render-path invariant.
 *
 * Runs against the REAL module, not a copy:
 *   node --experimental-strip-types --experimental-loader ./scripts/reshook.mjs \
 *        scripts/test-private-storage.mts
 *
 * `isRenderPath` is the only thing standing between "a bucket path is persisted"
 * and the two failure modes that motivated this bucket:
 *   - a data URL landing in the snapshot (400,000+ chars, blocks cloud sync
 *     entirely once the total trips sync.ts's limit), and
 *   - a SIGNED URL landing in the snapshot, which no existing scrubber rejects
 *     because they only test `^data:` — it would sync everywhere and then expire.
 */
import { isOwnPrivatePath, isRenderPath, RENDERS_BUCKET, RENDER_URL_TTL_SECONDS } from "../src/lib/supabase/private-storage.ts";

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}\n          got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// A realistic path, built the way uploadPrivateImage builds one.
const userId = "4cea3e46-1f1b-4457-b57f-a02c2b6d5e1e";
const good = `${userId}/${crypto.randomUUID()}.jpg`;
/** A different signed-in user, for the ownership checks. */
const other = "9f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b";

console.log("accepts a real path");
check("flat <uid>/<uuid>.jpg", isRenderPath(good), true);
check("png variant", isRenderPath(`${userId}/${crypto.randomUUID()}.png`), true);

console.log("rejects every shape that would poison the snapshot");
// The two that motivated the guard.
check("data URL", isRenderPath("data:image/jpeg;base64,/9j/4AAQSkZJRg=="), false);
check(
  "signed URL (expires; no scrubber catches it)",
  isRenderPath(
    `https://hfkgucfrqpzpxdzhszgb.supabase.co/storage/v1/object/sign/${RENDERS_BUCKET}/${good}?token=eyJhbGciOi`,
  ),
  false,
);
check("public URL", isRenderPath("https://example.supabase.co/storage/v1/object/public/x/y.jpg"), false);
check("blob URL", isRenderPath("blob:http://localhost:3200/abc-123"), false);
check("protocol-relative", isRenderPath("http://x/y.jpg"), false);

console.log("rejects malformed paths");
check("no folder", isRenderPath("render.jpg"), false);
check("nested (would survive account deletion)", isRenderPath(`${userId}/sub/render.jpg`), false);
check("traversal", isRenderPath(`${userId}/../other/render.jpg`), false);
check("leading slash", isRenderPath(`/${userId}/render.jpg`), false);
check("trailing slash only", isRenderPath(`${userId}/`), false);
check("empty", isRenderPath(""), false);
check("absurdly long", isRenderPath(`${userId}/${"a".repeat(600)}.jpg`), false);

console.log("rejects non-strings");
for (const [label, v] of [
  ["undefined", undefined],
  ["null", null],
  ["number", 1],
  ["object", { path: good }],
  ["array", [good]],
  ["true", true],
] as const) {
  check(label, isRenderPath(v), false);
}

console.log("isOwnPrivatePath — ownership, not just shape (AJA-276)");
// The "it works at all" anchor. Without this first, every rejection below would pass
// on a function that returned false unconditionally.
check("own folder", isOwnPrivatePath(good, userId), true);
check("another user's folder", isOwnPrivatePath(`${other}/${crypto.randomUUID()}.jpg`, userId), false);
// THE assertion this helper exists for. `path.startsWith(userId)` — the obvious
// implementation — returns true here, handing one user a pointer into a folder that
// merely shares a prefix.
check("prefix collision <uid>x/…", isOwnPrivatePath(`${userId}x/render.jpg`, userId), false);
check("empty userId matches nothing", isOwnPrivatePath(good, ""), false);
// Delegates to isRenderPath, so a URL containing the uid is still rejected.
check(
  "signed URL containing the uid",
  isOwnPrivatePath(`https://x.supabase.co/storage/v1/object/sign/${RENDERS_BUCKET}/${good}?token=e`, userId),
  false,
);
check("nested path in own folder", isOwnPrivatePath(`${userId}/sub/render.jpg`, userId), false);
check("non-string", isOwnPrivatePath(undefined, userId), false);

console.log("module constants are sane");
check("bucket name", RENDERS_BUCKET, "renders-private");
check("bucket is not the public one", RENDERS_BUCKET === "wardrobe-images", false);
check("ttl is short", RENDER_URL_TTL_SECONDS <= 3600, true);
check("ttl is usable", RENDER_URL_TTL_SECONDS >= 60, true);

console.log(
  failures === 0
    ? "\nPRIVATE-STORAGE CHECKS PASSED"
    : `\n${failures} PRIVATE-STORAGE CHECK(S) FAILED`,
);
if (failures) process.exit(1);
