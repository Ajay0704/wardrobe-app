// Every route, view and key UI state to capture, in user-flow order.
//
// `route`  — a real URL (standalone pages).
// `state`  — a zustand patch applied on the harness page (/navtest-figma), which mounts the
//            real <AppShell/>. Views not reachable by URL (the app is one route with a
//            store-driven view switch) are captured this way.
// `only`   — restrict to "desktop" (web chrome) or "mobile" (native iOS shell).
// `theme`  — "dark" to capture the dark theme.

import { itemPreviewParam } from "./seed.mjs";

export const scenes = [
  // ——— First run & marketing ———
  { slug: "first-run", title: "First-run journey (signed-out native)", route: "/first-run-preview" },
  { slug: "how-it-works", title: "How it works (marketing)", route: "/how-it-works" },

  // ——— Daily ———
  { slug: "home-today", title: "Home / Today", state: { view: "today" }, only: "desktop" },
  { slug: "explore", title: "Explore feed", state: { view: "explore" } },
  { slug: "photo-detail", title: "Explore photo detail", state: { view: "photoDetail", photoCard: { id: "fx-photo", image: "/hero-poster.jpg", title: "Soft tailoring for fall" } } },

  // ——— Closet ———
  { slug: "closet", title: "Closet grid", state: { view: "wardrobe", wardrobeTab: "items" } },
  { slug: "closet-item-detail", title: "Closet item detail", state: { view: "wardrobe", pendingOpenItemId: "fx-camel-sweater" } },
  { slug: "closet-wishlist-tab", title: "Closet · Wishlist tab", state: { view: "wardrobe", wardrobeTab: "wishlist" } },
  { slug: "create-sheet", title: "Create (+) sheet", state: { view: "wardrobe", addSheetOpen: true }, only: "mobile" },
  { slug: "add-item", title: "Add item modal", state: { view: "wardrobe", addOpen: true, addIntent: null } },
  { slug: "add-item-link", title: "Add item · paste link", state: { view: "wardrobe", addOpen: true, addIntent: "link" } },
  { slug: "bulk-import", title: "Bulk import", state: { view: "wardrobe", bulkOpen: true } },
  { slug: "shared-closets", title: "Shared closets sheet", state: { view: "wardrobe", closetsOpen: true } },

  // ——— Styling ———
  { slug: "builder", title: "Outfit builder canvas", state: { view: "builder" } },
  { slug: "outfits", title: "Outfits library", state: { view: "outfits" } },
  { slug: "outfit-detail", title: "Outfit detail", state: { view: "outfitDetail", selectedOutfitId: "fx-o-weekend" } },
  { slug: "stylist", title: "AI stylist", state: { view: "stylist" } },
  { slug: "calendar", title: "Calendar / wear log", state: { view: "calendar" } },
  { slug: "travel", title: "Travel / packing", state: { view: "travel" } },

  // ——— Shopping ———
  { slug: "wishlist", title: "Wishlist", state: { view: "wishlist" } },
  { slug: "wishlist-should-i-buy", title: "Wishlist · Should I buy?", state: { view: "wishlist", pendingDecideItemId: "fx-white-oxford" } },
  { slug: "add-to-wishlist", title: "Add to wishlist sheet", state: { view: "wishlist", wishlistAddOpen: true } },

  // ——— Insights & you ———
  { slug: "insights", title: "Insights", state: { view: "insights" } },
  { slug: "you", title: "You hub", state: { view: "you" } },
  { slug: "profile", title: "Profile", state: { view: "profile" } },
  { slug: "social-profile", title: "Social profile (native tab)", state: { view: "social" }, only: "mobile" },
  { slug: "notifications", title: "Notifications", state: { view: "notifications" } },
  { slug: "messages", title: "Messages", state: { view: "messages" } },

  // ——— Settings ———
  { slug: "fit-sizes", title: "Fit & sizes", state: { view: "fitSizes" } },
  { slug: "style-taste", title: "Style & taste", state: { view: "styleTaste" } },
  { slug: "settings-app", title: "App & region settings", state: { view: "settingsApp" } },
  { slug: "settings-account", title: "Account settings", state: { view: "settingsAccount" } },
  { slug: "settings", title: "Settings · Profile", state: { view: "settings", settingsSection: "profile" } },
  { slug: "settings-preferences", title: "Settings · Preferences", state: { view: "settings", settingsSection: "preferences" } },
  { slug: "settings-notifications", title: "Settings · Notifications", state: { view: "settings", settingsSection: "notifications" } },

  // ——— Dark theme ———
  { slug: "closet-dark", title: "Closet grid (dark)", state: { view: "wardrobe" }, theme: "dark" },
  { slug: "outfits-dark", title: "Outfits library (dark)", state: { view: "outfits" }, theme: "dark" },
  { slug: "explore-dark", title: "Explore feed (dark)", state: { view: "explore" }, theme: "dark" },

  // ——— Public share pages (no account) ———
  { slug: "public-profile", title: "Public profile /u/[handle]", route: "/u/mayachen" },
  { slug: "share-closet", title: "Shared closet /share/closet/[id]", route: "/share/closet/fx-share" },
  { slug: "item-share", title: "Shared item /i/[id]", route: `/i/fx-trench-coat?d=${itemPreviewParam}` },
  { slug: "extension-connect", title: "Browser extension connect", route: "/extension/connect?ext=fxextension" },
];
