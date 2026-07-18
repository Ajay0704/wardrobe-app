"use client";

import type { ReactNode } from "react";
import { useWardrobe } from "@/lib/store";
import { WardrobeView } from "./WardrobeView";
import { CanvasBuilderView } from "./CanvasBuilderView";
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
import { NativeProfileView } from "./native/NativeProfileView";
import { NativeUserProfileView } from "./native/NativeUserProfileView";
import { NotificationsView } from "./NotificationsView";
import { MessagesView } from "./chat/MessagesView";
import { ChatView } from "./chat/ChatView";
import { StylistView } from "./stylist/StylistView";
import { PhotoDetailView } from "./PhotoDetailView";
import { ItemForm } from "./ItemForm";
import { BulkImport } from "./BulkImport";
import { OutfitSplitImport } from "./OutfitSplitImport";
import { ClosetScanImport } from "./ClosetScanImport";

/**
 * Renders the current view's content. Shared by the web shell (AppShell) and the
 * native shell (NativeShell) so the two chromes wrap the exact same screens.
 * Also hosts the global "add item" modal opened by the center Create button.
 */
export function AppViews({ keepAliveTabs = false }: { keepAliveTabs?: boolean }) {
  const view = useWardrobe((s) => s.view);
  const addOpen = useWardrobe((s) => s.addOpen);
  const addIntent = useWardrobe((s) => s.addIntent);
  const setAddOpen = useWardrobe((s) => s.setAddOpen);
  const bulkOpen = useWardrobe((s) => s.bulkOpen);
  const setBulkOpen = useWardrobe((s) => s.setBulkOpen);
  const splitOpen = useWardrobe((s) => s.splitOpen);
  const splitSource = useWardrobe((s) => s.splitSource);
  const setSplitOpen = useWardrobe((s) => s.setSplitOpen);
  const scanOpen = useWardrobe((s) => s.scanOpen);
  const setScanOpen = useWardrobe((s) => s.setScanOpen);

  return (
    <>
      {/* Home was retired in the native shell (AJA-169); web still uses TodayView. */}
      {view === "today" && <TodayView />}

      {/* Native root tabs stay mounted (keepAliveTabs) so their scroll + in-screen
          state survive drilling into a sub-view and back (AJA-170). On web they
          render conditionally like everything else. */}
      <TabPane show={view === "explore"} keepAlive={keepAliveTabs}><ExploreView /></TabPane>
      <TabPane show={view === "wardrobe"} keepAlive={keepAliveTabs}><WardrobeView /></TabPane>
      <TabPane show={view === "outfits"} keepAlive={keepAliveTabs}><OutfitsView /></TabPane>
      <TabPane show={view === "social"} keepAlive={keepAliveTabs}><NativeProfileView /></TabPane>

      {view === "builder" && <CanvasBuilderView />}
      {view === "calendar" && <CalendarView />}
      {view === "wishlist" && <WishlistView />}
      {view === "travel" && <TravelView />}
      {view === "insights" && <InsightsView />}
      {view === "you" && <YouView />}
      {view === "profile" && <ProfileView />}
      {view === "userProfile" && <NativeUserProfileView />}
      {view === "settings" && <SettingsView />}
      {view === "notifications" && <NotificationsView />}
      {view === "messages" && <MessagesView />}
      {view === "chat" && <ChatView />}
      {view === "stylist" && <StylistView />}
      {view === "photoDetail" && <PhotoDetailView />}

      {addOpen && <ItemForm intent={addIntent} onClose={() => setAddOpen(false)} />}
      {bulkOpen && <BulkImport onClose={() => setBulkOpen(false)} />}
      {splitOpen && (
        <OutfitSplitImport source={splitSource ?? undefined} onClose={() => setSplitOpen(false)} />
      )}
      {scanOpen && <ClosetScanImport onClose={() => setScanOpen(false)} />}
    </>
  );
}

/**
 * A root-tab slot. With `keepAlive` (native shell) the screen stays mounted and
 * is just hidden when inactive, preserving its scroll and in-screen state. Without
 * it (web) it mounts only while active, matching the old conditional behavior.
 */
function TabPane({
  show,
  keepAlive,
  children,
}: {
  show: boolean;
  keepAlive: boolean;
  children: ReactNode;
}) {
  if (keepAlive) return <div hidden={!show}>{children}</div>;
  return show ? <>{children}</> : null;
}
