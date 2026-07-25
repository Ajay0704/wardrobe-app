"use client";

import {
  installNativeWindowOpenGuard,
  isNativeApp,
  openExternalUrl,
  refreshNativeDetection,
  stripNativeQueryFlag,
} from "@/lib/platform";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { getSupabase } from "@/lib/supabase/client";
import { useWardrobe } from "@/lib/store";
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Sticky: once true in this JS context, never goes back to false. */
let snapshot = false;

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True if boot script / Capacitor already marked this session as native. */
function domSaysNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (document.documentElement.classList.contains("native-app")) return true;
    if (isNativeApp()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function getSnapshot() {
  // Re-check every read so the first client render after boot script
  // never returns false and paints website chrome for one frame (AJA-22).
  if (!snapshot && domSaysNative()) {
    snapshot = true;
  }
  return snapshot;
}

function getServerSnapshot() {
  return false;
}

function lockNativeSnapshot() {
  if (snapshot) return;
  snapshot = true;
  try {
    document.documentElement.classList.add("native-app");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function ensureNativeDetected() {
  if (refreshNativeDetection() || isNativeApp() || domSaysNative()) {
    lockNativeSnapshot();
    stripNativeQueryFlag();
    return true;
  }
  return false;
}

// Eager client init so first paint after hydrate can already be native.
if (typeof window !== "undefined") {
  try {
    if (domSaysNative()) {
      snapshot = true;
      document.documentElement.classList.add("native-app");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Adds `native-app` on <html>, keeps detection sticky, and intercepts external
 * <a> clicks so shop links open in Safari instead of killing the app WebView.
 */
export function NativeAppClass() {
  useLayoutEffect(() => {
    ensureNativeDetected();
  }, []);

  useEffect(() => {
    ensureNativeDetected();
    installNativeWindowOpenGuard();

    let sub: { remove: () => void } | undefined;
    void Browser.addListener("browserFinished", () => {
      refreshNativeDetection();
      installNativeWindowOpenGuard();
    }).then((handle) => {
      sub = handle;
    });

    // OAuth callback deep link (AJA-194): Supabase redirects to
    // app.wardrobe.personal://login-callback#access_token=…&refresh_token=…
    // after Google/Apple sign-in. Read the tokens off the URL, set the session
    // (AuthProvider's onAuthStateChange then hydrates + un-gates the app), and
    // dismiss the system browser.
    let authSub: { remove: () => void } | undefined;
    void App.addListener("appUrlOpen", async ({ url }) => {
      if (!url) return;

      // Share deep link from the iOS Share Extension:
      //   app.wardrobe.personal://share?url=<encoded product url>
      // Queue the URL for ClipLinkLoader, which quick-saves it to the wishlist.
      const afterScheme = url.replace(/^[a-z0-9.+-]+:\/\//i, "");
      if (afterScheme.startsWith("share") || afterScheme.startsWith("clip")) {
        const q = url.indexOf("?");
        const params = new URLSearchParams(q >= 0 ? url.slice(q + 1) : "");
        const shared = (params.get("url") || "").trim();
        if (/^https?:\/\//i.test(shared)) {
          useWardrobe.getState().setPendingClipUrl(shared);
        }
        return;
      }

      if (!url.includes("login-callback")) return;
      const supabase = getSupabase();
      if (!supabase) return;
      const hashIndex = url.indexOf("#");
      const queryIndex = url.indexOf("?");
      const raw =
        hashIndex >= 0
          ? url.slice(hashIndex + 1)
          : queryIndex >= 0
            ? url.slice(queryIndex + 1)
            : "";
      const params = new URLSearchParams(raw);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      try {
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      } catch {
        /* leave the user on the gate to retry */
      } finally {
        void Browser.close().catch(() => {});
      }
    }).then((handle) => {
      authSub = handle;
    });

    const t1 = window.setTimeout(ensureNativeDetected, 50);
    const t2 = window.setTimeout(ensureNativeDetected, 500);
    const t3 = window.setTimeout(ensureNativeDetected, 2000);

    const onClick = (e: MouseEvent) => {
      if (!isNativeApp()) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("/") || href.startsWith("?")) {
        return;
      }
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.origin === window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      void openExternalUrl(url.toString());
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      sub?.remove();
      authSub?.remove();
    };
  }, []);
  return null;
}

/**
 * Shared sticky native flag for the whole app. Once true, never returns false
 * in this tab — prevents AppShell from swapping to website chrome.
 */
export function useIsNativeApp(): boolean {
  const native = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useLayoutEffect(() => {
    ensureNativeDetected();
  }, []);

  useEffect(() => {
    ensureNativeDetected();
    const t1 = window.setTimeout(ensureNativeDetected, 50);
    const t2 = window.setTimeout(ensureNativeDetected, 500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return native || isNativeApp() || domSaysNative();
}
