"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/platform";
import { ensureServiceWorker } from "@/lib/push-client";
import { registerNativePush, syncNativePushToken } from "@/lib/native-push";
import { useWardrobe } from "@/lib/store";

/**
 * Sets up push on whichever surface we're on: the service worker on the website, and native
 * APNs registration inside the Capacitor iOS app (AJA-286). The APNs token is user-scoped, so
 * we also re-sync it whenever a user signs in.
 */
export function PushBootstrap() {
  const authUser = useWardrobe((s) => s.authUser);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativeApp()) {
      void registerNativePush();
    } else {
      void ensureServiceWorker();
    }
  }, []);

  // The APNs token arrives once from the plugin; re-post it as soon as there's a signed-in user.
  useEffect(() => {
    if (isNativeApp() && authUser) void syncNativePushToken();
  }, [authUser]);

  return null;
}
