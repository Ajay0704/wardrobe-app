"use client";

import {
  CalendarDays,
  Heart,
  Home,
  LayoutGrid,
  LogOut,
  Moon,
  MoreHorizontal,
  Plane,
  Settings,
  Shirt,
  Sun,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useWardrobe, type View } from "@/lib/store";
import { signOut } from "@/lib/supabase/auth";
import { AppViews } from "../AppViews";
import { SyncBadge } from "../SyncBadge";

const TABS: { view: View; label: string; Icon: LucideIcon }[] = [
  { view: "wardrobe", label: "Closet", Icon: Shirt },
  { view: "builder", label: "Builder", Icon: Wand2 },
  { view: "outfits", label: "Outfits", Icon: LayoutGrid },
  { view: "wishlist", label: "Wishlist", Icon: Heart },
];

const MORE_ITEMS: { view: View; label: string; Icon: LucideIcon }[] = [
  { view: "today", label: "Today", Icon: Home },
  { view: "calendar", label: "Calendar", Icon: CalendarDays },
  { view: "travel", label: "Travel", Icon: Plane },
  { view: "settings", label: "Settings", Icon: Settings },
];

const TITLES: Partial<Record<View, string>> = {
  today: "Today",
  wardrobe: "Wardrobe",
  builder: "Builder",
  outfits: "Outfits",
  calendar: "Calendar",
  wishlist: "Wishlist",
  travel: "Travel",
  settings: "Settings",
};

const TAB_VIEWS = new Set<View>(TABS.map((t) => t.view));

/**
 * iOS-style app chrome for the Capacitor native shell: a compact top title bar,
 * the shared screens, and a bottom tab bar. Only rendered when running inside
 * the native app (see AppShell / isNativeApp) — the website keeps its own chrome.
 */
export function NativeShell() {
  const { view, setView, theme, setTheme, authUser, setAuthUser, setSyncStatus } =
    useWardrobe();
  const [moreOpen, setMoreOpen] = useState(false);

  const go = (v: View) => {
    setView(v);
    setMoreOpen(false);
  };

  const logOut = () => {
    setMoreOpen(false);
    setAuthUser(null);
    setSyncStatus("offline");
    void signOut();
  };

  return (
    <div className="native-shell flex min-h-[100dvh] flex-col bg-background">
      <header className="native-topbar">
        <span className="brand-wordmark-name !text-xl">
          {TITLES[view] ?? "Wardrobe"}
        </span>
        <SyncBadge />
      </header>

      <main className="native-main flex-1 overflow-y-auto px-4 pt-5">
        <AppViews />
      </main>

      <nav className="native-tabbar" aria-label="Primary">
        {TABS.map(({ view: v, label, Icon }) => (
          <button
            key={v}
            type="button"
            onClick={() => go(v)}
            aria-current={view === v ? "page" : undefined}
            className={`native-tab ${view === v ? "native-tab-active" : ""}`}
          >
            <Icon size={22} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`native-tab ${!TAB_VIEWS.has(view) ? "native-tab-active" : ""}`}
        >
          <MoreHorizontal size={22} strokeWidth={1.8} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div
          className="native-sheet-backdrop"
          onClick={() => setMoreOpen(false)}
          role="presentation"
        >
          <div
            className="native-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="More"
          >
            <div className="native-sheet-handle" />
            <div className="mb-2 flex items-center justify-between">
              <h2 className="heading text-lg">More</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="p-1 text-muted"
              >
                <X size={20} />
              </button>
            </div>

            {MORE_ITEMS.map(({ view: v, label, Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => go(v)}
                className={`native-sheet-row ${view === v ? "text-accent" : ""}`}
              >
                <Icon size={20} strokeWidth={1.7} />
                <span>{label}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="native-sheet-row"
            >
              {theme === "dark" ? (
                <Sun size={20} strokeWidth={1.7} />
              ) : (
                <Moon size={20} strokeWidth={1.7} />
              )}
              <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>

            {authUser && (
              <>
                <p className="mt-3 truncate px-1 text-xs text-muted">
                  Signed in as {authUser.email}
                </p>
                <button
                  type="button"
                  onClick={logOut}
                  className="native-sheet-row text-red-600 dark:text-red-400"
                >
                  <LogOut size={20} strokeWidth={1.7} />
                  <span>Log out</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
