/**
 * Self-contained share links for a single wardrobe item (AJA-205).
 *
 * Wardrobe items live in a per-user snapshot (no per-item table), so we can't
 * look one up by id on the server. Instead the share link carries a small,
 * URL-safe payload — name, brand, and public photo URL — that the public
 * `/i/[id]` page renders and turns into Open Graph tags for rich previews.
 * The `[id]` in the path lets "Open in Wardrobe" deep-link the owner straight
 * to that item. Runs on both server (Buffer) and client (btoa/atob).
 */

export type SharedItemPreview = {
  /** name */ n: string;
  /** brand */ b?: string;
  /** public image url */ i?: string;
};

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  const b64 =
    typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    if (typeof atob === "function") {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

/**
 * Encode the preview payload for the `?d=` param. Drops the image (then the
 * brand) if the link would balloon — e.g. an item still on a data: URL — so the
 * link never gets unreasonably long, but the name always survives.
 */
export function encodeItemPreview(preview: SharedItemPreview): string {
  const build = (p: SharedItemPreview) =>
    toBase64Url(new TextEncoder().encode(JSON.stringify(p)));
  try {
    let encoded = build(preview);
    if (encoded.length > 900 && preview.i) {
      encoded = build({ n: preview.n, b: preview.b });
    }
    if (encoded.length > 900) encoded = build({ n: preview.n });
    return encoded;
  } catch {
    return "";
  }
}

export function decodeItemPreview(value: string): SharedItemPreview | null {
  if (!value) return null;
  const bytes = fromBase64Url(value);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as SharedItemPreview;
    return parsed && typeof parsed.n === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Custom-scheme deep link that opens the installed app to this item. */
export function appItemDeepLink(itemId: string): string {
  return `app.wardrobe.personal://item?id=${encodeURIComponent(itemId)}`;
}

/**
 * Where "Get the app" points. Uses the App Store listing once
 * NEXT_PUBLIC_IOS_APP_ID is set; until the app is published, sends people to
 * the marketing site so the button never dead-ends.
 */
export function getTheAppUrl(): string {
  const appId = process.env.NEXT_PUBLIC_IOS_APP_ID;
  return appId ? `https://apps.apple.com/app/id${appId}` : "/how-it-works";
}
