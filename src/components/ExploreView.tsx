"use client";

import { useState } from "react";
import { CommunityFeed } from "./community/CommunityFeed";
import { ExploreForYouHeader } from "./explore/ExploreForYouHeader";
import { ShopSearchView } from "./shop/ShopSearchView";
import { useIsNativeApp } from "./NativeAppClass";

type Tab = "foryou" | "following" | "shop";

const TABS: [Tab, string][] = [
  ["foryou", "For you"],
  ["following", "Following"],
  ["shop", "Shop"],
];

/**
 * Explore — a closet-aware, personalized surface (AJA-155).
 *  - "For you": the daily closet-driven layer (outfit-of-the-day, occasion
 *    styling, Ask-your-stylist, Wardrobe Wrapped) — see ExploreForYouHeader.
 *  - "Following": the community feed.
 *  - "Shop": closet-aware product search.
 *
 * The old external "Pinterest" masonry feed (and its Saved tab) was removed in
 * favor of the closet-aware For-you layer.
 */
export function ExploreView() {
  const isNative = useIsNativeApp();
  const [tab, setTab] = useState<Tab>("foryou");

  return (
    <div className="space-y-4">
      {!isNative && <h2 className="heading text-2xl">Explore</h2>}

      <div className="flex items-center gap-5 border-b border-line text-sm">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
              tab === id ? "border-accent text-accent" : "border-transparent text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "foryou" ? (
        <ExploreForYouHeader />
      ) : tab === "following" ? (
        <CommunityFeed />
      ) : (
        <ShopSearchView />
      )}
    </div>
  );
}
