"use client";

import { useSyncExternalStore } from "react";
import { AppShell } from "@/components/AppShell";

/** True only after client hydration — avoids localStorage vs SSR mismatch. */
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function Home() {
  const hydrated = useHydrated();

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
