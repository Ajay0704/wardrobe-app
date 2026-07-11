"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/platform";
import { ensureServiceWorker } from "@/lib/push-client";

/**
 * Registers the push service worker on the website (not Capacitor).
 * Native apps need APNs later; web push only works in a real browser / PWA.
 */
export function PushBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativeApp()) return;
    void ensureServiceWorker();
  }, []);
  return null;
}
