import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/import-item";

export const runtime = "nodejs";

/**
 * Permanently delete the signed-in user's account (App Store Guideline
 * 5.1.1(v) requires in-app deletion for apps with account creation).
 *
 * Deleting the Supabase auth user cascades through the app's foreign keys:
 * the user's own content — wardrobe snapshot, posts, trips, messages,
 * detections, follows, wishlist, … — is removed, and their footprint in other
 * people's content (follow/notification actor, shared conversations) is nulled
 * out. Stored images live under a `${userId}/` folder, so we best-effort wipe
 * that first. Irreversible; the client double-confirms (type-to-confirm) before
 * calling this.
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
  try {
    const { data: files } = await admin.storage.from(BUCKET).list(user.id);
    if (files?.length) {
      await admin.storage
        .from(BUCKET)
        .remove(files.map((f) => `${user.id}/${f.name}`));
    }
  } catch {
    /* orphaned image blobs are unreachable once the DB rows are gone */
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
