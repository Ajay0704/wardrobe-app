import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/import-item";
import { RENDERS_BUCKET } from "@/lib/supabase/private-storage";

export const runtime = "nodejs";

/** Supabase caps a single list() page, and remove() takes a bounded array. */
const PAGE = 1000;
const REMOVE_CHUNK = 100;
/** Stop rather than loop forever if a bucket somehow reports a cycle. */
const MAX_OBJECTS = 20_000;

/**
 * Recursively delete everything under `prefix` in `bucket`. Returns the count removed.
 *
 * AJA-275: this used to be a single non-recursive `list(user.id)`, which is only
 * correct while every path is flat. Supabase returns sub-prefixes as entries with
 * `id === null`, and `remove()` on a prefix is a SILENT no-op — so one nested
 * object would have survived account deletion with no error anywhere. Renders are
 * body photographs, so that is exactly the failure we cannot ship.
 *
 * Paths are collected first and deleted afterwards, deliberately: removing during
 * traversal shifts the offsets the pagination is walking, which silently skips files.
 */
async function wipeUserFolder(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  const files: string[] = [];
  const dirs: string[] = [prefix];

  while (dirs.length && files.length < MAX_OBJECTS) {
    const dir = dirs.pop()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(dir, { limit: PAGE, offset });
      if (error || !data?.length) break;
      for (const entry of data) {
        const path = `${dir}/${entry.name}`;
        // A null id marks a prefix, not an object.
        if (entry.id === null) dirs.push(path);
        else files.push(path);
      }
      if (data.length < PAGE) break;
    }
  }

  let removed = 0;
  for (let i = 0; i < files.length; i += REMOVE_CHUNK) {
    const chunk = files.slice(i, i + REMOVE_CHUNK);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (!error) removed += chunk.length;
  }
  return removed;
}

/**
 * Permanently delete the signed-in user's account (App Store Guideline
 * 5.1.1(v) requires in-app deletion for apps with account creation).
 *
 * Deleting the Supabase auth user cascades through the app's foreign keys:
 * the user's own content — wardrobe snapshot, posts, trips, messages,
 * detections, follows, wishlist, … — is removed, and their footprint in other
 * people's content (follow/notification actor, shared conversations) is nulled
 * out. Stored images live under a `${userId}/` folder in each bucket, so we
 * best-effort wipe those first. Irreversible; the client double-confirms
 * (type-to-confirm) before calling this.
 */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") {
    return Response.json({ error: "Sign in to delete your account." }, { status: 401 });
  }

  const admin = adminClient();
  if (!admin) {
    return Response.json(
      { error: "Account deletion is not configured (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 },
    );
  }

  // Best-effort storage cleanup — never block the account deletion on it.
  // Both buckets: item/avatar images, and the private try-on renders (AJA-275).
  for (const bucket of [BUCKET, RENDERS_BUCKET]) {
    try {
      await wipeUserFolder(admin, bucket, user.id);
    } catch {
      /* orphaned image blobs are unreachable once the DB rows are gone */
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
