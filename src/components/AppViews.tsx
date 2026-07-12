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
import { ExploreView } from "./ExploreView";
import { ProfileView } from "./ProfileView";
import { ItemForm } from "./ItemForm";
import { BulkImport } from "./BulkImport";

/**
 * Renders the current view's content. Shared by the web shell (AppShell) and the
 * native shell (NativeShell) so the two chromes wrap the exact same screens.
 * Also hosts the global "add item" modal opened by the center Create button.
 */
export function AppViews() {
  const view = useWardrobe((s) => s.view);
  const addOpen = useWardrobe((s) => s.addOpen);
  const setAddOpen = useWardrobe((s) => s.setAddOpen);
  const bulkOpen = useWardrobe((s) => s.bulkOpen);
  const setBulkOpen = useWardrobe((s) => s.setBulkOpen);
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
      {view === "explore" && <ExploreView />}
      {view === "profile" && <ProfileView />}
      {view === "settings" && <SettingsView />}

      {addOpen && <ItemForm onClose={() => setAddOpen(false)} />}
      {bulkOpen && <BulkImport onClose={() => setBulkOpen(false)} />}
    </>
  );
}
