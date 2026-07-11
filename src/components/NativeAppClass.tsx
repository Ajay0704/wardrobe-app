"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/platform";

/**
 * Adds the `native-app` class to <html> when running inside the Capacitor shell,
 * so CSS and components can branch the look (app vs website) on the same URL.
 * No-op in a normal browser, so the website is unaffected.
 */
export function NativeAppClass() {
  useEffect(() => {
    document.documentElement.classList.toggle("native-app", isNativeApp());
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
