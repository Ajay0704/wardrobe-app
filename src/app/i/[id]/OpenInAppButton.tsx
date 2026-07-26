"use client";

import { useState } from "react";
import { appItemDeepLink } from "@/lib/item-share";

/**
 * Fires the app's custom URL scheme to open the item in the installed app.
 * If the app isn't installed nothing happens and the page stays put, with the
 * "Get the app" button right below as the fallback.
 */
export function OpenInAppButton({ itemId }: { itemId: string }) {
  const [tried, setTried] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setTried(true);
        window.location.href = appItemDeepLink(itemId);
      }}
      className="block w-full rounded-2xl bg-[color:var(--foreground)] px-4 py-3.5 text-center text-sm font-semibold text-[color:var(--background)]"
    >
      {tried ? "Opening Wardrobe…" : "Open in Wardrobe"}
    </button>
  );
}
