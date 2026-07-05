"use client";

import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useWardrobe, type View } from "@/lib/store";
import { ProfileAvatar } from "./ProfileAvatar";
import { ShareLinkLoader } from "./ShareLinkLoader";
import { SupabaseSync } from "./SupabaseSync";
import { ThemeEffect } from "./ThemeEffect";
import { WardrobeView } from "./WardrobeView";
import { OutfitBuilderView } from "./OutfitBuilderView";
import { OutfitsView } from "./OutfitsView";
import { WishlistView } from "./WishlistView";
import { SettingsView } from "./SettingsView";

const NAV: { view: View; label: string }[] = [
  { view: "wardrobe", label: "Wardrobe" },
  { view: "builder", label: "Builder" },
  { view: "outfits", label: "Outfits" },
  { view: "wishlist", label: "Wishlist" },
];

/** Forbes / Medium-style publication masthead */
function BrandWordmark({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="brand-wordmark group shrink-0 text-left transition-opacity hover:opacity-80"
      aria-label="Your Personal Wardrobe — home"
    >
      <span className="brand-wordmark-kicker">Your Personal</span>
      <span className="brand-wordmark-name">Wardrobe</span>
    </button>
  );
}

export function AppShell() {
  const { view, setView, theme, setTheme, profile } = useWardrobe();

  return (
    <>
      <ThemeEffect />
      <ShareLinkLoader />

      <header className="sticky top-0 z-40 border-b border-line bg-background">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-4 px-4 py-4 sm:gap-8 sm:px-6 sm:py-5">
          {/* Left — publication wordmark */}
          <BrandWordmark onClick={() => setView("wardrobe")} />

          {/* Right — nav + utilities (Forbes / Medium layout) */}
          <div className="flex min-w-0 flex-1 items-end justify-end gap-4 sm:gap-6">
            <nav
              className="flex items-end gap-4 overflow-x-auto sm:gap-7"
              aria-label="Main"
            >
              {NAV.map(({ view: v, label }) => (
                <NavLink key={v} active={view === v} onClick={() => setView(v)}>
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2 border-l border-line pl-3 sm:pl-4">
              <div className="hidden md:block">
                <SupabaseSync />
              </div>
              <ProfileAvatar
                profile={profile}
                size={34}
                active={view === "settings"}
                onClick={() => setView("settings")}
              />
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
                className="p-1.5 text-muted transition-colors hover:text-foreground"
              >
                {theme === "dark" ? (
                  <Sun size={18} strokeWidth={1.5} />
                ) : (
                  <Moon size={18} strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {view === "wardrobe" && <WardrobeView />}
        {view === "builder" && <OutfitBuilderView />}
        {view === "outfits" && <OutfitsView />}
        {view === "wishlist" && <WishlistView />}
        {view === "settings" && <SettingsView />}
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        Your wardrobe lives in this browser — ready to sync to Supabase later.
      </footer>
    </>
  );
}

function NavLink({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap border-b-2 pb-3 font-sans text-sm transition-colors sm:text-[15px] ${
        active
          ? "border-foreground font-medium text-foreground"
          : "border-transparent text-muted hover:border-foreground/30 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
