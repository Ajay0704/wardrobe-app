/**
 * AJA-275 — private storage for on-body try-on renders.
 *
 * Separate from `storage.ts` on purpose. That module is built around
 * `wardrobe-images`, which is a PUBLIC bucket ("Anyone can view images"), and it
 * compresses to `maxDim 1200` on the way in. Both are wrong here: a render is a
 * photograph of the user's face and body, and it arrives already sized by the model.
 *
 * THE INVARIANT THIS MODULE EXISTS TO PROTECT: what gets persisted is a bucket
 * PATH, never a URL.
 *
 * A signed URL is a ~200-character `https:` string. None of the app's scrubbers
 * would reject one — `heal.ts`'s `isBadInline` only tests `^data:`, and
 * `sync.ts` does the same — so a signed URL written into the snapshot would sync
 * happily to every device, silently expire an hour later, and leave the user with
 * a look whose thumbnail has stopped loading for no visible reason. Paths are also
 * ~40 chars against a data URL's 400,000+, which is the difference between fitting
 * in the snapshot and blocking sync entirely.
 */
import { getSupabase } from "./client";

export const RENDERS_BUCKET = "renders-private";

/** Signed-URL lifetime. Short because these are body photos; callers re-sign on
 *  mount rather than holding one. Long enough to survive a slow list render. */
export const RENDER_URL_TTL_SECONDS = 600;

/**
 * True when `v` looks like a bucket path rather than a URL or inline data.
 *
 * Use this as the validator wherever a render path is read back from persistence
 * (`normalizeOutfit`, the scrubbers). It is the guard that keeps the invariant
 * above from decaying: a failed upload writing a `data:` URL, or a caller
 * accidentally persisting the result of `signedRenderUrl`, both get stripped here
 * instead of poisoning the snapshot.
 */
export function isRenderPath(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length > 0 &&
    v.length < 512 &&
    !/^(data:|blob:|https?:)/i.test(v) &&
    // `<uuid-ish user folder>/<file>` — one slash, no traversal.
    /^[^/]+\/[^/]+$/.test(v) &&
    !v.includes("..")
  );
}

/**
 * Upload a render and return its PATH. Throws on failure.
 *
 * Deliberately no data-URL fallback: `resolveImageSource` has one, and it is what
 * used to poison sync when an upload failed. Here a failure must surface so the
 * caller can tell the user the render wasn't saved, rather than quietly persisting
 * half a megabyte of base64.
 *
 * Path stays FLAT (`<userId>/<uuid>.jpg`) — account deletion's cleanup uses a
 * non-recursive list, so anything nested would outlive the account.
 */
export async function uploadPrivateRender(blob: Blob, userId: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Storage is not configured.");
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(RENDERS_BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/**
 * Mint a short-lived signed URL for display. NEVER persist the result — see the
 * module comment. Returns null rather than throwing so a single unreadable render
 * degrades to a fallback thumbnail instead of breaking a whole list.
 */
export async function signedRenderUrl(
  path: string,
  ttlSeconds = RENDER_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!isRenderPath(path)) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(RENDERS_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  return error ? null : (data?.signedUrl ?? null);
}

/**
 * Sign many paths in ONE request, for a grid of looks.
 *
 * Signing per card would fire a request per outfit on every mount of the Looks
 * screen; `createSignedUrls` does the lot in one round trip. Returns a
 * path -> url map, silently omitting any path the server couldn't sign, so one
 * bad row degrades to a fallback thumbnail instead of blanking the grid.
 *
 * Same rule as the singular version: the values are ephemeral. Render them, never
 * store them.
 */
export async function signedRenderUrls(
  paths: string[],
  ttlSeconds = RENDER_URL_TTL_SECONDS,
): Promise<Record<string, string>> {
  const valid = [...new Set(paths.filter(isRenderPath))];
  if (valid.length === 0) return {};
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data, error } = await supabase.storage
    .from(RENDERS_BUCKET)
    .createSignedUrls(valid, ttlSeconds);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  }
  return out;
}

/**
 * Delete a render. Best-effort: the caller clears the stored path regardless, so a
 * failure here leaves an orphaned blob rather than a look pointing at an image the
 * user asked to remove. Orphans are swept by account deletion.
 */
export async function deletePrivateRender(path: string): Promise<void> {
  if (!isRenderPath(path)) return;
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.storage.from(RENDERS_BUCKET).remove([path]);
}
