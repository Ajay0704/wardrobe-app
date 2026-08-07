import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/import-item";
import { isFilterSafePath, ownsPath, unreferencedPaths } from "@/lib/image-refs";
import { scanReferences } from "@/lib/image-refs-server";

export const runtime = "nodejs";
export const maxDuration = 30;

/** remove() takes a bounded array. */
const REMOVE_CHUNK = 100;
/** An item has four image slots; more than this is a caller bug, not a big item. */
const MAX_PATHS = 16;

/**
 * AJA-284 — delete an item's images, but only the ones nobody else points at.
 *
 * This has to run server-side with the service role. RLS means the client cannot see
 * another user's rows (so it would read "unreferenced" for something plainly in use),
 * and a client should never be trusted to enumerate the tables that count.
 *
 * Fails CLOSED everywhere. A blob wrongly kept costs disk and `scripts/reclaim-orphan-
 * images.mjs` collects it later; a blob wrongly deleted leaves a broken image in a
 * conversation someone else can still scroll back through, and nothing brings it back.
 * Every error path therefore deletes nothing and says so.
 */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  if (!admin) return Response.json({ error: "Not configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body as { paths?: unknown })?.paths;
  const itemId = (body as { itemId?: unknown })?.itemId;
  // Not optional in effect: the snapshot push races this call, so the server usually
  // still sees the deleted item. Without its id every path looks referenced and the
  // sweep quietly removes nothing.
  if (typeof itemId !== "string" || !itemId) {
    return Response.json({ error: "itemId is required" }, { status: 400 });
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PATHS) {
    return Response.json({ error: `paths must be 1-${MAX_PATHS} strings` }, { status: 400 });
  }

  // Ownership is checked here and nowhere else that matters. Reject the whole request on
  // a single bad path rather than filtering the good ones through: a caller sending
  // someone else's path is a bug or an attack, and neither should get a partial success
  // whose response it can probe with.
  if (!raw.every((p) => ownsPath(p, user.id))) {
    return Response.json({ error: "path outside your folder" }, { status: 403 });
  }
  const paths = raw as string[];
  if (!paths.every(isFilterSafePath)) {
    return Response.json({ error: "unsupported characters in path" }, { status: 400 });
  }

  const { referenced, failed, notes } = await scanReferences(admin, paths, user.id, itemId);
  const doomed = unreferencedPaths(paths, referenced, failed);

  let removed = 0;
  for (let i = 0; i < doomed.length; i += REMOVE_CHUNK) {
    const chunk = doomed.slice(i, i + REMOVE_CHUNK);
    const { error } = await admin.storage.from(BUCKET).remove(chunk);
    if (error) {
      notes.push(`remove: ${error.message}`);
      break;
    }
    removed += chunk.length;
  }

  return Response.json({
    ok: !failed,
    removed,
    kept: paths.length - removed,
    ...(notes.length ? { notes } : {}),
  });
}
