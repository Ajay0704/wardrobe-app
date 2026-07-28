import sharp from "sharp";
import { dominantFromRgba } from "./color";

/**
 * Dominant colour of an image, server-side (AJA-243).
 *
 * Shares `dominantFromRgba` with the browser path so both answer identically — the
 * value ends up compared against closet colours for duplicate detection, so two
 * implementations drifting apart would show up as wrong "you already own this" calls.
 *
 * `sharp` is already a dependency. Downsampled to 48px first: it's ~50x less work than
 * decoding a full product photo and the quantized buckets don't care.
 */
export async function dominantColorFromBytes(
  bytes: Uint8Array | ArrayBuffer,
): Promise<string | null> {
  try {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const { data } = await sharp(buf)
      .resize(48, 48, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return dominantFromRgba(data);
  } catch {
    return null; // unsupported/corrupt image — the caller falls back to the title
  }
}

/** Fetch an image and read its dominant colour. Returns null on any failure. */
export async function dominantColorFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return dominantColorFromBytes(await res.arrayBuffer());
  } catch {
    return null;
  }
}
