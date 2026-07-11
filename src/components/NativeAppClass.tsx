"use client";

import { useEffect, useRef, useState } from "react";
import { isNativeApp, openExternalUrl } from "@/lib/platform";

const NATIVE_LOCK_KEY = "wardrobe:native-shell";

/**
 * Adds the `native-app` class to <html> when running inside the Capacitor shell,
 * so CSS and components can branch the look (app vs website) on the same URL.
 * No-op in a normal browser, so the website is unaffected.
 *
 * Also intercepts in-app clicks on external http(s) links so they open in Safari
 * instead of replacing the WebView.
 */
export function NativeAppClass() {
  useEffect(() => {
    const apply = () => {
      const native = isNativeApp() || sessionStorage.getItem(NATIVE_LOCK_KEY) === "1";
      if (isNativeApp()) sessionStorage.setItem(NATIVE_LOCK_KEY, "1");
      document.documentElement.classList.toggle("native-app", native);
      return native;
    };

    if (!apply()) return;

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
      if (url.origin === window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      void openExternalUrl(url.toString());
    };

    document.addEventListener("click", onClick, true);
    // Bridge can inject slightly after first paint when using server.url
    const t1 = window.setTimeout(apply, 50);
    const t2 = window.setTimeout(apply, 400);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);
  return null;
}

/**
 * Client hook: false during SSR. Once we detect the Capacitor shell, stay on
 * the native chrome for the rest of the session (avoids flipping to the website
 * top-nav after opening a wishlist item / remount).
 */
export function useIsNativeApp(): boolean {
  const locked = useRef(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const check = () => {
      if (isNativeApp() || sessionStorage.getItem(NATIVE_LOCK_KEY) === "1") {
        if (isNativeApp()) sessionStorage.setItem(NATIVE_LOCK_KEY, "1");
        locked.current = true;
        setNative(true);
      }
    };
    check();
    const t1 = window.setTimeout(check, 50);
    const t2 = window.setTimeout(check, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return locked.current || native;
}
