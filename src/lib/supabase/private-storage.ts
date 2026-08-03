/**
 * AJA-275 / AJA-276 — private storage for the user's own body imagery.
 *
 * Two things live in the `renders-private` bucket, and they are the same
 * sensitivity class: the on-body try-on RENDERS (`Outfit.tryOnRenderPath`) and the
 * saved reference PHOTO those renders are generated from (`profile.tryOnPhotoPath`).
 *
 * Separate from `storage.ts` on purpose. That module is built around
 * `wardrobe-images`, which is a PUBLIC bucket ("Anyone can view images"), and it
 * compresses to `maxDim 1200` on the way in. Both are wrong here: these are
 * photographs of the user's face and body, and a render arrives already sized by
 * the model.
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
 *
 * Function names here are deliberately about the BUCKET, not about renders. The
 * old render-specific names invited the next caller to write their own uploader
 * for a different kind of image and get the flat-path rule wrong.
 */
import { getSupabase } from "./client";
import { blobToDataUrl } from "./storage";

export const RENDERS_BUCKET = "renders-private";

/** Signed-URL lifetime. Short because these are body photos; callers re-sign on
 *  mount rather than holding one. Long enough to survive a slow list render. */
export const RENDER_URL_TTL_SECONDS = 600;

/**
 * True when `v` looks like a bucket path rather than a URL or inline data.
 *
 * Use this as the validator wherever a private-image path is read back from
 * persistence — `normalizeOutfit` / `setOutfitRender` for a render,
 * `setTryOnPhoto` / `scrubSnapshotImages` for the reference photo. It is the guard
 * that keeps the invariant above from decaying: a failed upload writing a `data:`
 * URL, or a caller accidentally persisting the result of `signedPrivateUrl`, both
 * get stripped here instead of poisoning the snapshot.
 *
 * Named for renders because that was its first use and it has ~20 call sites; it
 * has always been a path-SHAPE check and applies unchanged to any object here.
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
 * True when `path` is a valid private path sitting in THIS user's folder.
 *
 * Guards the one way a foreign path legitimately arrives: `AuthProvider` seeds a
 * brand-new account from whatever profile is in local state, so signing in as B on
 * A's device inherits A's `tryOnPhotoPath`. RLS makes that a dead pointer rather
 * than a leak — but without this check the UI would claim a photo is saved and
 * then never manage to load it.
 *
 * Compares the first path SEGMENT rather than using `startsWith`, which would
 * accept `<uid>x/photo.jpg` as belonging to `<uid>`.
 */
export function isOwnPrivatePath(path: unknown, userId: string): path is string {
  if (!isRenderPath(path) || !userId) return false;
  return path.slice(0, path.indexOf("/")) === userId;
}

/**
 * Upload an image and return its PATH. Throws on failure.
 *
 * Deliberately no data-URL fallback: `resolveImageSource` has one, and it is what
 * used to poison sync when an upload failed. Here a failure must surface so the
 * caller can tell the user the image wasn't saved, rather than quietly persisting
 * half a megabyte of base64.
 *
 * Path stays FLAT (`<userId>/<uuid>.jpg`) — `isRenderPath` allows exactly one
 * slash, so every validator in the app would reject a nested path. (Account
 * deletion is recursive and would cope either way; the validators are the binding
 * reason.)
 *
 * Always a fresh uuid, never a stable name with `upsert`. The bucket has select /
 * insert / delete policies but NO update policy, so an upsert would be refused by
 * RLS. Replace = upload new, repoint, then delete the old.
 */
export async function uploadPrivateImage(blob: Blob, userId: string): Promise<string> {
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
 * module comment. Returns null rather than throwing so a single unreadable image
 * degrades to a fallback thumbnail instead of breaking a whole list.
 *
 * Only correct for DISPLAY. Signing succeeds for a path whose object no longer
 * exists (the 404 arrives on GET), so this cannot tell you a pointer is dead —
 * use `privateImageDataUrl` when you need to know.
 */
export async function signedPrivateUrl(
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
 * Sign a path AND download the bytes as a data URL. Throws with a showable
 * message.
 *
 * Throwing is the point. The alternative — handing a signed URL to `/api/tryon`
 * and letting the server's `toBase64` fetch it — fails SILENTLY: `toBase64`
 * returns null on a 404 or a timeout, the route then flips to `hasPerson: false`,
 * and the user pays for a generation that renders a stranger. That is exactly the
 * AJA-274 bug. Failing here costs nothing and can be reported.
 */
export async function privateImageDataUrl(path: string): Promise<string> {
  const url = await signedPrivateUrl(path);
  if (!url) throw new Error("Couldn't get a link for that photo.");
  const res = await fetch(url);
  if (!res.ok) throw new Error("That photo is no longer in storage.");
  return blobToDataUrl(await res.blob());
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
 * Delete an image. Best-effort: the caller clears the stored path regardless, so a
 * failure here leaves an orphaned blob rather than a record pointing at an image
 * the user asked to remove. Orphans are swept by account deletion.
 *
 * Note a refused delete is INDISTINGUISHABLE from a successful one — Supabase
 * returns no error and an empty array when RLS declines. Don't build anything on
 * this resolving as proof the object is gone.
 */
export async function deletePrivateImage(path: string): Promise<void> {
  if (!isRenderPath(path)) return;
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.storage.from(RENDERS_BUCKET).remove([path]);
}
