/**
 * AJA-284 — who else is pointing at a wardrobe-images blob?
 *
 * Three tables deliberately snapshot an item's metadata so a *friend* can see it
 * without reading the owner's private `wardrobe_snapshots` row — the migrations say
 * so in as many words (`shared_closet_items`: "snapshotted … because a member can't
 * read another member's private wardrobe_snapshots blob"; `messages.payload`:
 * "self-contained snapshot for shared content").
 *
 * But they snapshot the URL, not the pixels. So the snapshot is NOT self-contained:
 * the blob underneath is a shared dependency. AJA-283's sweep only asked "does another
 * ITEM still use this?", so deleting a shared piece left a permanently broken image in
 * someone else's chat thread or shared closet — measured at 175 of ~550 live images on
 * a real account, across two multi-member closets and three two-person conversations.
 *
 * This module holds the reference map and the pure decisions. The scan itself needs the
 * service role (a client cannot read another user's rows, and must not be trusted to
 * enumerate tables), so it lives in the API route.
 */

/** A table that can hold a public wardrobe-images URL, and where. */
export interface RefSource {
  table: string;
  /** Columns matchable with a PostgREST `ilike` filter. */
  text: string[];
  /** jsonb columns — PostgREST can't pattern-match these, so they're scanned in memory. */
  jsonb?: string[];
}

/**
 * Every place outside `wardrobe_snapshots` that stores a wardrobe-images URL.
 *
 * NOT read off the schema by eye. Derived by scanning all 40 REST-exposed tables against
 * a real database, and the first hand-written version of this list was missing nine
 * columns — `detections.crop_path` plus every denormalized avatar copy — which
 * `scripts/test-image-refs.mts` caught on its first run.
 *
 * The avatar columns look irrelevant (an item does not own the profile picture) and are
 * included anyway. They are stale copies: `styling_sessions.owner_avatar` holds whatever
 * the avatar was when that session started, so `profiles.avatar_url` alone does not cover
 * them. The cost of checking is one filter; the cost of being wrong is someone's avatar
 * disappearing from a conversation. Being wrong in the "keep it" direction is free.
 *
 * This list WILL fall behind the schema — that is the same failure mode as the bug it
 * fixes — so the test re-derives it from the live database and fails on drift.
 */
export const REF_SOURCES: readonly RefSource[] = [
  { table: "styling_session_items", text: ["item_image_url"] },
  { table: "shared_closet_items", text: ["item_image_url"] },
  { table: "wishlist_items", text: ["image_url"] },
  { table: "detections", text: ["image_url", "crop_path"] },
  { table: "profiles", text: ["avatar_url"] },
  { table: "styling_sessions", text: ["owner_avatar", "stylist_avatar"] },
  { table: "follows", text: ["actor_avatar"] },
  { table: "shared_closet_members", text: ["member_avatar", "inviter_avatar"] },
  { table: "notifications", text: ["actor_avatar"] },
  { table: "messages", text: ["sender_avatar"], jsonb: ["payload"] },
];

/** Flattened `table.column` pairs, for the drift test to compare against. */
export function refColumns(): string[] {
  return REF_SOURCES.flatMap((s) => [...s.text, ...(s.jsonb ?? [])].map((c) => `${s.table}.${c}`));
}

/**
 * Characters a bucket path may contain before it is spliced into a PostgREST `or=()`
 * filter. Paths are `<uuid>/<uuid>.<ext>`, so this is generous. Anything outside it
 * could break out of the filter grammar (a comma ends a term, parens end the group), and
 * a malformed filter can silently match nothing — which reads as "unreferenced" and
 * deletes a live blob. So an unexpected path fails the scan instead of being escaped.
 */
const PATH_SAFE = /^[A-Za-z0-9/_.\-]+$/;

export function isFilterSafePath(path: string): boolean {
  return PATH_SAFE.test(path) && !path.includes("..");
}

/** The PostgREST `or=(…)` term list matching any of `paths` in any of `columns`. */
export function ilikeOr(columns: readonly string[], paths: readonly string[]): string {
  return columns.flatMap((c) => paths.map((p) => `${c}.ilike.*${p}*`)).join(",");
}

/**
 * Paths safe to delete: the candidates nobody else references.
 *
 * Direction of failure matters more than precision here. A path wrongly kept costs
 * disk and is reclaimable later; a path wrongly deleted breaks an image in someone
 * else's conversation, which nothing brings back. So every uncertain case must resolve
 * to "keep" — that is what `scanFailed` is for.
 */
export function unreferencedPaths(
  candidates: readonly string[],
  referenced: ReadonlySet<string>,
  scanFailed: boolean,
): string[] {
  if (scanFailed) return [];
  return candidates.filter((p) => !referenced.has(p));
}

/**
 * True when `haystack` mentions `path`.
 *
 * Substring, not equality: the stored value is a full public URL and may carry a query
 * string or percent-encoding, and a false *positive* only keeps a blob alive. Exact
 * matching would risk the opposite, which is the failure we cannot take.
 */
export function mentionsPath(haystack: unknown, path: string): boolean {
  if (!path) return false;
  const s =
    typeof haystack === "string" ? haystack : haystack == null ? "" : JSON.stringify(haystack);
  return s.includes(path) || s.includes(encodeURIComponent(path));
}

/**
 * Every candidate path must sit directly inside the caller's own folder.
 *
 * Compared segment-wise, never with startsWith: `<uid>x/f.jpg` starts with `<uid>` and
 * would otherwise be sweepable by user `<uid>`. Without this the route is a delete
 * primitive pointed at any folder in a public bucket.
 */
export function ownsPath(path: unknown, userId: string): path is string {
  if (typeof path !== "string" || !path || !userId) return false;
  if (path.includes("..")) return false;
  const slash = path.indexOf("/");
  if (slash <= 0) return false;
  return path.slice(0, slash) === userId;
}
