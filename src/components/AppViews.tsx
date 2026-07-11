"use client";

import { useWardrobe } from "@/lib/store";
import { WardrobeView } from "./WardrobeView";
import { OutfitBuilderView } from "./OutfitBuilderView";
import { OutfitsView } from "./OutfitsView";
import { WishlistView } from "./WishlistView";
import { TravelView } from "./TravelView";
import { SettingsView } from "./SettingsView";
import { TodayView } from "./TodayView";
import { CalendarView } from "./CalendarView";
import { InsightsView } from "./InsightsView";

/**
 * Renders the current view's content. Shared by the web shell (AppShell) and the
 * native shell (NativeShell) so the two chromes wrap the exact same screens.
 */
export function AppViews() {
  const view = useWardrobe((s) => s.view);
  return (
    <>
      {view === "today" && <TodayView />}
      {view === "wardrobe" && <WardrobeView />}
      {view === "builder" && <OutfitBuilderView />}
      {view === "outfits" && <OutfitsView />}
      {view === "calendar" && <CalendarView />}
      {view === "wishlist" && <WishlistView />}
      {view === "travel" && <TravelView />}
      {view === "insights" && <InsightsView />}
      {view === "settings" && <SettingsView />}
    </>
  );
}
