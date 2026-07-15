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

function blobToDataUrl(blob: Blob): Promise<string> {
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
