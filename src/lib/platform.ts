import { Capacitor } from "@capacitor/core";

/**
 * True when running inside the Capacitor native shell (the iOS app), false in a
 * normal browser. Used to branch the UI for Option 1 "dual UI" while sharing one
 * backend and one production URL.
 *
 * Detection order (both, for robustness):
 *   1. `Capacitor.isNativePlatform()` — set when the web view is the Capacitor shell.
 *   2. User-agent contains `WardrobeApp` — injected via `overrideUserAgent` in
 *      `capacitor.config.ts`, a fallback if the Capacitor global isn't ready.
 *
 * SSR-safe: returns false on the server, so the website look is the default.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* not in a Capacitor context */
  }
  return navigator.userAgent.includes("WardrobeApp");
}
