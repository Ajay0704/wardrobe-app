import { encodeItemPreview, type SharedItemPreview } from "./item-share";
import type { WardrobeItem } from "./types";

const FALLBACK_ORIGIN = "https://wardrobe-app-lilac-two.vercel.app";

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
 * The public link to share for this item: `/i/<id>?d=<encoded name/brand/photo>`.
 * The page renders that payload and derives Open Graph tags from it (so the
 * photo previews), and `<id>` lets "Open in Wardrobe" deep-link the owner to
 * this exact item. Built synchronously so the iOS share sheet keeps its tap
 * activation.
 */
function itemShareUrl(item: WardrobeItem): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : FALLBACK_ORIGIN;
  const preview: SharedItemPreview = { n: item.name };
  const brand = item.brand?.trim();
  if (brand) preview.b = brand;
  // Only inline http(s) photos — a data: URL would bloat the link.
  if (item.imageUrl && /^https?:\/\//i.test(item.imageUrl)) preview.i = item.imageUrl;
  const d = encodeItemPreview(preview);
  return `${origin}/i/${encodeURIComponent(item.id)}${d ? `?d=${d}` : ""}`;
}

/**
 * Share a single wardrobe item to other apps via the native iOS share sheet.
 *
 * Shares a link back into the app (with a rich preview), not a raw file — so
 * recipients can open the item in Wardrobe, and the link is the payload. Prefers
 * the Web Share API (maps to UIActivityViewController in the app's WKWebView, no
 * native plugin needed); falls back to the Capacitor Share plugin, then to
 * copying the link.
 */
export async function shareItem(item: WardrobeItem): Promise<void> {
  if (typeof navigator === "undefined") return;
  const nav = navigator;
  const url = itemShareUrl(item);
  const text = shareCaption(item);

  const webShare = typeof nav.share === "function" ? nav.share.bind(nav) : null;
  if (webShare) {
    try {
      await webShare({ title: item.name, text, url });
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
    await nav.clipboard?.writeText(url);
  } catch {
    // Clipboard blocked — nothing more we can do silently.
  }
}
