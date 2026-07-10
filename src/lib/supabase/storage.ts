import { getSupabase } from "./client";

const BUCKET = "wardrobe-images";

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
export async function resolveImageSource(
  file: File,
  userId: string | null,
): Promise<string> {
  const blob = await compressImage(file);
  if (userId) {
    try {
      return await uploadToStorage(blob, userId);
    } catch {
      // Bucket missing / offline — fall back to a (compressed) inline data URL.
    }
  }
  return blobToDataUrl(blob);
}
