import { getSupabase } from "./client";

const BUCKET = "wardrobe-images";

/** Turn a base64 data: URL into a File so it can be (re-)hosted via Storage. */
export function dataUrlToFile(dataUrl: string, name = "image"): File {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes("png") ? "png" : "jpg";
  return new File([bytes], `${name.replace(/\.\w+$/, "")}.${ext}`, { type: mime });
}

/**
 * Downscale + re-encode an image in the browser so neither a Storage upload nor
 * the base64 fallback ever carries a multi-megabyte payload. A phone photo
 * (~3-5MB) becomes ~100-200KB, which keeps the cloud snapshot small and sync
 * fast. Non-raster images (e.g. SVG) and anything that can't be decoded are
 * returned untouched.
 */
async function compressImage(
  file: File,
  maxDim = 1200,
  quality = 0.82,
): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // JPEG can't hold transparency. For formats that might have an alpha channel,
  // sample the pixels — if any are transparent, keep PNG so cutouts/logos don't
  // get a black background; otherwise JPEG for much smaller files.
  let outType = "image/jpeg";
  if (file.type === "image/png" || file.type === "image/webp") {
    try {
      const { data } = ctx.getImageData(0, 0, w, h);
      for (let i = 3; i < data.length; i += 4 * 17) {
        if (data[i] < 255) {
          outType = "image/png";
          break;
        }
      }
    } catch {
      outType = "image/png"; // couldn't inspect — preserve transparency to be safe
    }
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outType, outType === "image/jpeg" ? quality : undefined),
  );
  // If compression somehow grew the file, keep the smaller original.
  return blob && blob.size < file.size ? blob : file;
}

/** Exported for `private-storage.ts`, which decodes a signed download into a data
 *  URL. Pure and bucket-agnostic — a second FileReader there would be a copy. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload an image to Supabase Storage and return its public URL. Files live
 * under the user's own folder so RLS can scope writes. Throws on failure.
 */
async function uploadToStorage(blob: Blob, userId: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Storage is not configured.");
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Get a storable image reference for a file. Images are compressed first, then
 * when signed in uploaded to Storage (returns a small URL, keeping the cloud
 * snapshot tiny). Falls back to a compressed base64 data URL when logged out or
 * if the upload fails (e.g. the Storage bucket isn't set up yet), so image
 * saving always works.
 */
/**
 * Turn a HEIC/HEIF file into something canvas can re-encode. Native WebKit (the iOS
 * WKWebView, and Safari) decodes HEIC directly, so if createImageBitmap succeeds we hand
 * the original file straight to compressImage. Otherwise (desktop web) fall back to
 * heic2any/libheif; if that also can't decode the format, throw a friendly error.
 */
async function decodeHeic(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    bmp.close?.();
    return file; // native decode works — compressImage will re-encode it
  } catch {
    /* fall through to heic2any */
  }
  try {
    const heic2any = (await import("heic2any")).default as (opts: {
      blob: Blob;
      toType?: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const jpeg = Array.isArray(out) ? out[0] : out;
    return new File([jpeg], file.name.replace(/\.hei[cf]$/i, ".jpg"), {
      type: "image/jpeg",
    });
  } catch {
    throw new Error(
      "Couldn't read that HEIC photo — convert it to JPEG or PNG and try again.",
    );
  }
}

/**
 * Compress (and HEIC-decode) a picked photo into an inline data URL WITHOUT
 * uploading it (AJA-274).
 *
 * For the try-on reference photo, where `resolveImageSource` is wrong twice over: it
 * uploads to the PUBLIC `wardrobe-images` bucket, and it returns a URL when the
 * caller needs bytes to post. Since AJA-276 that photo IS kept — but in the private
 * bucket and as a path (see `private-storage.ts`), which is a separate decision from
 * getting the file into a postable shape, and that is all this function does.
 *
 * Before this, TryOnView used a bare `FileReader`, which skipped compression (a
 * full-res phone photo went into the JSON body) AND skipped `decodeHeic`, so an
 * iPhone HEIC photo failed outright with an unhelpful error.
 *
 * The defaults are deliberately looser than `compressImage`'s 1200/0.82: at 1200px
 * a 1086x1448 reference is downscaled to 900x1200 and an already-tiny face loses
 * ~17% of its linear detail — the opposite of what the try-on accuracy work needs.
 */
export async function toCompressedDataUrl(
  file: File,
  maxDim = 1600,
  quality = 0.9,
): Promise<string> {
  let source = file;
  if (/image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    source = await decodeHeic(file);
  }
  return blobToDataUrl(await compressImage(source, maxDim, quality));
}

export async function resolveImageSource(
  file: File,
  userId: string | null,
): Promise<string> {
  // HEIC/HEIF from the iOS photo library. The app's real runtime is the iOS WKWebView,
  // which decodes HEIC natively — so try a native canvas decode first (that path also
  // feeds compressImage below). Only non-Apple browsers (desktop web) need the heic2any
  // fallback, and even that can't handle every iPhone HEVC-HEIC (ERR_LIBHEIF).
  let source = file;
  if (/image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    source = await decodeHeic(file);
  }

  const blob = await compressImage(source);
  if (userId) {
    try {
      return await uploadToStorage(blob, userId);
    } catch (err) {
      const detail =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "";
      // Prefer failing loudly when signed in — silent base64 fallback is what
      // caused persistent "Sync error" for oversized snapshots.
      throw new Error(
        detail
          ? `Image upload failed (${detail}). Check the wardrobe-images Storage bucket.`
          : "Image upload failed. Check the wardrobe-images Storage bucket in Supabase.",
      );
    }
  }
  return blobToDataUrl(blob);
}

/** The four slots an item can hold an uploaded image in. */
const IMAGE_FIELDS = [
  "imageUrl",
  "beautifiedImageUrl",
  "beautifyWhiteUrl",
  "cutoutImageUrl",
] as const;

/**
 * The bucket path inside a public wardrobe-images URL, or null for anything else
 * (a data: URL, a remote product image, a URL for a different bucket).
 */
export function bucketPathFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const raw = url.slice(i + marker.length).split("?")[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Every wardrobe-images path an item points at, deduped. */
export function itemImagePaths(item: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const f of IMAGE_FIELDS) {
    const p = bucketPathFromUrl(item[f]);
    if (p) out.add(p);
  }
  return [...out];
}

/**
 * AJA-283 — remove an item's uploaded images when the item goes.
 *
 * `deleteItem` only ever touched the record, and no caller cleaned up after it, so every
 * deleted piece left its blob behind: measured at 890 orphans / 509 MB on a real account
 * against 547 live images. `wardrobe-images` is PUBLIC (share links serve from it), so an
 * orphan stays fetchable by URL to anyone who had one — this is not only wasted storage.
 *
 * Best-effort and non-throwing, exactly like `deletePrivateImage`: losing a blob must
 * never block the delete the user asked for.
 *
 * Two guards, both load-bearing:
 *  - ownership — only paths inside `${userId}/`, compared SEGMENT-wise, so a bucket path
 *    beginning `<uid>x/` can never be swept by user `<uid>`.
 *  - sharing — a path still referenced by any surviving item is skipped. Duplicated items
 *    and re-imports can point two records at one upload, and deleting one of them must
 *    not blank the other.
 */
export async function deleteItemImages(
  item: Record<string, unknown>,
  userId: string | null,
  survivingItems: ReadonlyArray<Record<string, unknown>>,
): Promise<void> {
  if (!userId) return;
  const supabase = getSupabase();
  if (!supabase) return;

  const doomed = orphanedItemPaths(item, userId, survivingItems);
  if (!doomed.length) return;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(doomed);
    // NEVER swallow this. The first version ignored the result and shipped against a
    // bucket that had NO delete policy, so every call was refused by RLS and the sweep
    // did nothing at all — invisibly, because supabase-js returns an error object here
    // rather than throwing. Two deletions on device produced eight fresh orphans and a
    // clean console.
    //
    // console.ERROR, not warn: next.config.ts sets `removeConsole: { exclude: ["error"] }`,
    // so warn/log are stripped from production bundles. The first attempt at this fix
    // used warn and was therefore just as silent in production as the bug it replaced —
    // caught by grepping the deployed chunks for the string, which was not there.
    // Still best-effort (the record is already gone and a retry has nowhere to run).
    if (error) console.error(`[storage] could not remove ${doomed.length} image(s):`, error.message);
  } catch (err) {
    console.error("[storage] image cleanup threw:", err);
  }
}

/**
 * Which of an item's image paths are safe to remove — the whole decision, pure and
 * testable, so the two guards below are covered without a Storage client.
 *
 *  - OWNERSHIP: the first path segment must equal `userId`. Compared segment-wise, not
 *    with startsWith, or a path under `<uid>x/` would be swept by user `<uid>`.
 *  - SHARING: a path any surviving item still points at is kept. Duplicated items and
 *    re-imports can point two records at one upload, and deleting one must not blank
 *    the other.
 */
export function orphanedItemPaths(
  item: Record<string, unknown>,
  userId: string | null,
  survivingItems: ReadonlyArray<Record<string, unknown>>,
): string[] {
  if (!userId) return [];
  const stillUsed = new Set<string>();
  for (const other of survivingItems) {
    if (!other || other.id === item.id) continue;
    for (const p of itemImagePaths(other)) stillUsed.add(p);
  }
  return itemImagePaths(item).filter(
    (p) => p.slice(0, p.indexOf("/")) === userId && !stillUsed.has(p),
  );
}
