"use client";

import { useWardrobe } from "@/lib/store";

/**
 * AJA-248 — host route for the Surprise me prototype. TEMPORARY, delete with the
 * prototype.
 *
 * Why this exists: `public/surprise-proto.html` originally read the closet from
 * `localStorage["wardrobe-store-v2"]`, which is per-origin AND per-webview. The
 * installed iOS app runs in a WKWebView with its own storage jar, so opening the
 * static page in mobile Safari found nothing. This route runs inside the app, so
 * it reads the LIVE zustand store and hands the closet to the page over
 * postMessage — no localStorage, no bundled wardrobe data, and the prototype's
 * markup/CSS/engine stay in public/ with zero duplication.
 */
export default function SurpriseProtoHost() {
  const items = useWardrobe((s) => s.items);
  const usable = items.filter((i) => i && !i.wishlist && i.imageUrl);

  const send = (w: Window | null) => {
    if (!w) return;
    w.postMessage(
      { type: "proto-closet", items: usable },
      window.location.origin,
    );
  };

  return (
    <div className="flex h-dvh w-full flex-col bg-black">
      {/* A WKWebView has no browser chrome, so without this the app is a
          force-quit away from being usable again after tapping into here. */}
      <div
        className="flex items-center gap-3 px-4 text-sm"
        style={{ paddingTop: "max(env(safe-area-inset-top), 10px)", paddingBottom: 10 }}
      >
        <a href="/n?native=1" className="font-semibold text-white/90 underline">
          ‹ Back to app
        </a>
        <span className="text-white/40">AJA-248 prototype</span>
      </div>
      {usable.length < 8 && (
        <div className="px-4 py-3 text-sm text-amber-300">
          Only {usable.length} usable items in the store — sign in and let the
          closet sync, then reload this page.
        </div>
      )}
      <iframe
        title="Surprise me prototype"
        src="/surprise-proto.html"
        className="min-h-0 w-full flex-1 border-0"
        // The iframe's scripts are classic (non-deferred), so its message
        // listener is registered before `load` fires — posting here is safe.
        // Using the event's own target avoids a ref entirely (react-hooks/refs).
        // If the closet syncs in after this, reload the page to resend.
        onLoad={(e) => send(e.currentTarget.contentWindow)}
      />
    </div>
  );
}
