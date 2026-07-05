import { getSupabase } from "./client";

const BUCKET = "wardrobe-images";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload an image to Supabase Storage and return its public URL. Files live
 * under the user's own folder so RLS can scope writes. Throws on failure.
 */
async function uploadToStorage(file: File, userId: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Storage is not configured.");
  const ext =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Get a storable image reference for a file. When signed in, uploads to Storage
 * and returns a small URL (keeps the cloud snapshot tiny). Falls back to a
 * base64 data URL when logged out or if the upload fails (e.g. the Storage
 * bucket isn't set up yet), so image saving always works.
 */
export async function resolveImageSource(
  file: File,
  userId: string | null,
): Promise<string> {
  if (userId) {
    try {
      return await uploadToStorage(file, userId);
    } catch {
      // Bucket missing / offline — fall back to an inline data URL.
    }
  }
  return fileToDataUrl(file);
}
