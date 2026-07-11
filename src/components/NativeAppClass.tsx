"use client";

import { useEffect, useState } from "react";
import { isNativeApp, openExternalUrl } from "@/lib/platform";

/**
 * Adds the `native-app` class to <html> when running inside the Capacitor shell,
 * so CSS and components can branch the look (app vs website) on the same URL.
 * No-op in a normal browser, so the website is unaffected.
 *
 * Also intercepts in-app clicks on external http(s) links so they open in Safari
 * instead of replacing the WebView (which looked like "switching to web layout"
 * with no way back).
 */
export function NativeAppClass() {
  useEffect(() => {
    const native = isNativeApp();
    document.documentElement.classList.toggle("native-app", native);
    if (!native) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("/")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      // Same-origin app routes stay in the WebView.
      if (url.origin === window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      void openExternalUrl(url.toString());
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}

/** Client hook mirror of {@link isNativeApp}: false during SSR/first paint,
 *  resolves to the real value after mount (avoids hydration mismatch). */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  return native;
}
