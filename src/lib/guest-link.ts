/**
 * Keeping a guest's closet when they sign in with Google or Apple (AJA-309).
 *
 * Email sign-up upgrades the anonymous guest in place (`convertGuest`), and pushes the
 * captured pieces itself before AuthProvider ever pulls. Google / Apple go through a browser
 * round trip instead, and used to start a brand-new account: AuthProvider then saw an empty
 * snapshot and, by design, pushed an empty closet over the device — wiping everything the guest
 * had just photographed.
 *
 * The fix links the provider to the SAME anonymous user (`linkIdentity`), so the id and the
 * Storage cutouts carry over. Two small facts have to survive the browser round trip for that
 * to work, and they live here, free of Capacitor imports so the node tests can load them:
 *   - who the guest on this device is, so the first pull after the upgrade keeps the local
 *     closet instead of the empty one;
 *   - which provider a pending link was for, so a link that hits an account that already
 *     exists can fall back to signing into it.
 */
import type { CalendarEntry, Outfit, WardrobeItem } from "./types";

type Provider = "google" | "apple";

const GUEST_OWNER_KEY = "wardrobe:guest-owner";
const PENDING_LINK_KEY = "wardrobe:oauth-link-pending";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // blocked storage — every helper degrades to "nothing remembered"
  }
}

/** Record that the local closet on this device belongs to this guest user id. */
export function rememberGuestOwner(userId: string) {
  try {
    storage()?.setItem(GUEST_OWNER_KEY, userId);
  } catch {
    /* ignore */
  }
}

export function readGuestOwner(): string | null {
  try {
    return storage()?.getItem(GUEST_OWNER_KEY) ?? null;
  } catch {
    return null;
  }
}

export function clearGuestOwner() {
  try {
    storage()?.removeItem(GUEST_OWNER_KEY);
  } catch {
    /* ignore */
  }
}

export function rememberPendingLink(provider: Provider) {
  try {
    storage()?.setItem(PENDING_LINK_KEY, provider);
  } catch {
    /* ignore */
  }
}

/** Read AND clear the pending link, so a stale one can never steer a later sign-in. */
export function takePendingLink(): Provider | null {
  try {
    const s = storage();
    const v = s?.getItem(PENDING_LINK_KEY) ?? null;
    s?.removeItem(PENDING_LINK_KEY);
    return v === "google" || v === "apple" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Read the OAuth callback deep link. Supabase puts tokens in the fragment, but errors can
 * arrive in the query, the fragment or both — so read both, fragment winning.
 */
export function parseAuthCallback(url: string): {
  accessToken: string | null;
  refreshToken: string | null;
  errorCode: string | null;
} {
  const hashAt = url.indexOf("#");
  const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = beforeHash.indexOf("?");
  const params = new URLSearchParams(queryAt >= 0 ? beforeHash.slice(queryAt + 1) : "");
  if (hashAt >= 0) {
    for (const [k, v] of new URLSearchParams(url.slice(hashAt + 1))) params.set(k, v);
  }
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    errorCode: params.get("error_code"),
  };
}

/**
 * The provider to retry as a plain sign-in, or null. Only one failure qualifies: our guest link
 * hit a Google / Apple identity that already belongs to an account. That person already has a
 * closet, so they get signed into it. Any other error leaves them on the sheet to retry.
 */
export function linkFallbackProvider(
  errorCode: string | null,
  pendingLink: Provider | null,
): Provider | null {
  return errorCode === "identity_already_exists" ? pendingLink : null;
}

/**
 * What a brand-new (empty) cloud account starts with. Normally nothing — local data could be a
 * previous signed-out user's. The one exception is the account that IS the guest who captured
 * the local closet on this device.
 */
export function seedForEmptyAccount(
  uid: string,
  guestOwner: string | null,
  local: { items: WardrobeItem[]; outfits: Outfit[]; calendar: CalendarEntry[] },
): { items: WardrobeItem[]; outfits: Outfit[]; calendar: CalendarEntry[]; keptGuest: boolean } {
  if (guestOwner && guestOwner === uid) return { ...local, keptGuest: true };
  return { items: [], outfits: [], calendar: [], keptGuest: false };
}
