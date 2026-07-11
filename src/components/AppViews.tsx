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
import { YouView } from "./YouView";
import { ItemForm } from "./ItemForm";

/**
 * Renders the current view's content. Shared by the web shell (AppShell) and the
 * native shell (NativeShell) so the two chromes wrap the exact same screens.
 * Also hosts the global "add item" modal opened by the center Create button.
 */
export function AppViews() {
  const view = useWardrobe((s) => s.view);
  const addOpen = useWardrobe((s) => s.addOpen);
  const setAddOpen = useWardrobe((s) => s.setAddOpen);
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
      {view === "you" && <YouView />}
      {view === "settings" && <SettingsView />}

      {addOpen && <ItemForm onClose={() => setAddOpen(false)} />}
    </>
  );
}
