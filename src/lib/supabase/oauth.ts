import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { rememberPendingLink } from "@/lib/guest-link";
import { isNativeApp } from "@/lib/platform";
import { isGuestSession } from "./auth";
import { getSupabase } from "./client";

export type OAuthProvider = "google" | "apple";

/** First native build that registered the `app.wardrobe.personal://` scheme. */
const MIN_NATIVE_OAUTH_VERSION = "1.1.0";

function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Whether OAuth sign-in can actually complete on this client. On the web the
 * redirect flow always works. In the native app it needs the deep-link scheme,
 * which only exists from v1.1.0 — so on older installed builds we hide the
 * buttons rather than let them dead-end in the system browser. This lets the
 * web ship ahead of the App Store build without breaking the current app.
 */
export async function oauthSupported(): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    const { version } = await App.getInfo();
    return cmpVersion(version, MIN_NATIVE_OAUTH_VERSION) >= 0;
  } catch {
    return false;
  }
}

/**
 * Custom URL scheme the iOS app registers (Info.plist). Supabase redirects here
 * after a successful OAuth handshake; NativeAppClass listens for it, reads the
 * session tokens off the URL, and signs the user in.
 */
export const NATIVE_OAUTH_REDIRECT = "app.wardrobe.personal://login-callback";

/**
 * Start Google / Apple sign-in (AJA-194).
 *
 * Native: Google rejects OAuth inside an embedded WebView ("disallowed_
 * useragent"), so we open the provider in the system browser
 * (SFSafariViewController via @capacitor/browser) and let Supabase redirect
 * back to the app through the `app.wardrobe.personal://login-callback` deep
 * link. We deliberately keep the client's default (token) flow so the existing
 * password-reset links keep working cross-device — the deep-link handler reads
 * the tokens straight off the callback URL.
 *
 * Web: a normal full-page redirect; supabase-js `detectSessionInUrl` finishes
 * the sign-in when the page loads back up.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sign-in is not configured.");

  if (isNativeApp()) {
    // AJA-309: a guest who chooses Google / Apple must keep the closet they just photographed.
    // Link the provider to the SAME anonymous user rather than signing in as a new one, which
    // used to land them in an empty account. Guests only exist in the app (the website has no
    // guest journey), so the web path below is unchanged.
    if (await isGuestSession()) {
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true },
      });
      if (!error && data?.url) {
        rememberPendingLink(provider);
        await Browser.open({ url: data.url });
        return;
      }
      // Refused before any browser opened — typically "Allow manual linking" is off in
      // Supabase. A plain sign-in still works; it just can't carry the guest's pieces.
      console.warn("[oauth] couldn't link the guest, signing in instead:", error?.message);
    }
    await openNativeSignIn(provider);
    return;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

/** Plain native OAuth sign-in: provider page in the system browser, back via the deep link. */
async function openNativeSignIn(provider: OAuthProvider): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sign-in is not configured.");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: NATIVE_OAUTH_REDIRECT,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Couldn't start sign-in. Please try again.");
  await Browser.open({ url: data.url });
}

/**
 * The guest link came back with `identity_already_exists`: that Google / Apple account already
 * has a closet. Sign into it instead (the guest's pieces merge in on the first pull, as before).
 * Returns whether a new sign-in was started, so the caller leaves the browser to it.
 */
export async function signInAfterFailedLink(provider: OAuthProvider | null): Promise<boolean> {
  if (!provider) return false;
  await Browser.close().catch(() => {});
  await openNativeSignIn(provider);
  return true;
}
