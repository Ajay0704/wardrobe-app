"use client";

import { useLayoutEffect } from "react";
import { useSyncExternalStore } from "react";
import { AppShell } from "@/components/AppShell";
import { NATIVE_LOCK_KEY } from "@/lib/platform";

/** True only after client hydration — avoids localStorage vs SSR mismatch. */
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Capacitor entry (`/n`). Always locks native shell before paint so the
 * WebView never loads the dual-chrome marketing homepage.
 */
export default function NativeEntry() {
  const hydrated = useHydrated();

  useLayoutEffect(() => {
    document.documentElement.classList.add("native-app");
    try {
      localStorage.setItem(NATIVE_LOCK_KEY, "1");
      sessionStorage.setItem(NATIVE_LOCK_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  if (!hydrated) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="brand-wordmark text-center text-muted">
          <span className="brand-wordmark-kicker">Your Personal</span>
          <span className="brand-wordmark-name">Wardrobe</span>
        </div>
      </main>
    );
  }

  return <AppShell />;
}
