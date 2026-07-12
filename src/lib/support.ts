import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { openExternalUrl } from "@/lib/platform";

/** Public marketing / install URL shared from Settings. */
export const APP_SHARE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://wardrobe-app-lilac-two.vercel.app";

/** Apple App Store numeric id (when published). Enables Rate the app. */
export const IOS_APP_ID = process.env.NEXT_PUBLIC_IOS_APP_ID?.trim() || "";

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "tajay0704@gmail.com";

export function appStoreWriteReviewUrl(appId = IOS_APP_ID): string | null {
  if (!appId) return null;
  return `https://apps.apple.com/app/id${appId}?action=write-review`;
}

function mailto(subject: string, body?: string): string {
  const q = new URLSearchParams({ subject });
  if (body) q.set("body", body);
  return `mailto:${SUPPORT_EMAIL}?${q.toString()}`;
}

/** Opens the system mail composer (or mailto handler). */
export async function openSupportMail(
  kind: "feedback" | "feature",
): Promise<void> {
  const subject =
    kind === "feature"
      ? "Wardrobe — feature request"
      : "Wardrobe — feedback";
  const body =
    kind === "feature"
      ? "What would you like Wardrobe to do?\n\n"
      : "What's on your mind?\n\n";
  await openExternalUrl(mailto(subject, body));
}

/**
 * Request an App Store rating. Needs NEXT_PUBLIC_IOS_APP_ID once published.
 * Returns a short user-facing message when the store page isn't configured yet.
 */
export async function rateApp(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const url = appStoreWriteReviewUrl();
  if (!url) {
    return {
      ok: false,
      message:
        "App Store listing isn’t live yet. Use Send feedback — or we’ll enable Rate after TestFlight / App Store.",
    };
  }
  await openExternalUrl(url);
  return { ok: true };
}

/** Native share sheet when available; otherwise copy link to clipboard. */
export async function shareApp(): Promise<
  { ok: true; mode: "share" | "copy" } | { ok: false; message: string }
> {
  const title = "Wardrobe";
  const text = "Organize your closet and get daily outfit ideas.";
  const url = APP_SHARE_URL;

  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title, text, url, dialogTitle: "Share Wardrobe" });
      return { ok: true, mode: "share" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel|dismiss|abort/i.test(msg)) return { ok: true, mode: "share" };
  }

  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title, text, url });
      return { ok: true, mode: "share" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) return { ok: true, mode: "share" };
  }

  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, mode: "copy" };
  } catch {
    return {
      ok: false,
      message: `Couldn't share — copy this link: ${url}`,
    };
  }
}
