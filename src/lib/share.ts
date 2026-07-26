import type { WardrobeItem } from "./types";

/** "Name · Brand" (or just the name when the brand is unknown). */
function shareCaption(item: WardrobeItem): string {
  const brand = item.brand?.trim();
  return brand ? `${item.name} · ${brand}` : item.name;
}

/** A dismissed share sheet rejects with an AbortError — treat it as success. */
function isAbort(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { name?: string }).name === "AbortError"
  );
}

/**
 * Best-effort fetch of the item photo as a shareable File so the share sheet can
 * hand an actual image to Instagram / Messages instead of a bare link. Returns
 * null on any failure (CORS, non-image, offline) so callers fall back to a link.
 */
async function imageToFile(url: string, name: string): Promise<File | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const ext = blob.type.split("/")[1]?.split("+")[0] || "jpg";
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "item";
    return new File([blob], `${slug}.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
}

/**
 * Share a single wardrobe item to other apps via the native iOS share sheet.
 *
 * Prefers the Web Share API — inside the app's WKWebView it maps straight to
 * UIActivityViewController with no native plugin, so it ships via web deploy.
 * When possible we attach the actual photo (Instagram/Messages get an image,
 * not just a link); otherwise we share name + brand + link. If Web Share is
 * unavailable or loses its tap activation, we fall back to the Capacitor Share
 * plugin (no gesture requirement), then to copying the link.
 */
export async function shareItem(item: WardrobeItem): Promise<void> {
  if (typeof navigator === "undefined") return;
  const nav = navigator;
  const text = shareCaption(item);
  const url = item.productUrl?.trim() || item.imageUrl || undefined;

  const webShare =
    typeof nav.share === "function" ? nav.share.bind(nav) : null;
  const canShare =
    typeof nav.canShare === "function" ? nav.canShare.bind(nav) : null;

  if (webShare) {
    try {
      const file =
        item.imageUrl && canShare ? await imageToFile(item.imageUrl, item.name) : null;
      if (file && canShare?.({ files: [file] })) {
        await webShare({ files: [file], title: item.name, text });
      } else {
        await webShare({ title: item.name, text, url });
      }
      return;
    } catch (err) {
      if (isAbort(err)) return;
      // Otherwise fall through to the native plugin.
    }
  }

  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: item.name, text, url });
    return;
  } catch {
    // Plugin not in this build, or the sheet was dismissed.
  }

  try {
    if (url) await nav.clipboard?.writeText(url);
  } catch {
    // Clipboard blocked — nothing more we can do silently.
  }
}
