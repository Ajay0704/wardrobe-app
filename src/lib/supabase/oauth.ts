import { Browser } from "@capacitor/browser";
import { isNativeApp } from "@/lib/platform";
import { getSupabase } from "./client";

export type OAuthProvider = "google" | "apple";

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
    return;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}
