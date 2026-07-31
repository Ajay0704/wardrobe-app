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
import { isRenderPath, RENDERS_BUCKET, RENDER_URL_TTL_SECONDS } from "../src/lib/supabase/private-storage.ts";

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}\n          got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// A realistic path, built the way uploadPrivateRender builds one.
const userId = "4cea3e46-1f1b-4457-b57f-a02c2b6d5e1e";
const good = `${userId}/${crypto.randomUUID()}.jpg`;

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
