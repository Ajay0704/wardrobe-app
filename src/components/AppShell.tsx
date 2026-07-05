"use client";

import { Moon, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useWardrobe, type View } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { AuthModal, type AuthMode } from "./AuthModal";
import { AuthProvider } from "./AuthProvider";
import { ProfileAvatar } from "./ProfileAvatar";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { ShareLinkLoader } from "./ShareLinkLoader";
import { SyncBadge } from "./SyncBadge";
import { ThemeEffect } from "./ThemeEffect";
import { VideoBackground } from "./VideoBackground";
import { Button } from "./ui";
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

function AuthGateSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2">
      <span className="brand-wordmark-name text-3xl">Wardrobe</span>
      <span className="text-xs text-muted">Loading your closet…</span>
    </div>
  );
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle theme"
      className="p-1.5 text-muted transition-colors hover:text-foreground"
    >
      {theme === "dark" ? (
        <Sun size={18} strokeWidth={1.5} />
      ) : (
        <Moon size={18} strokeWidth={1.5} />
      )}
    </button>
  );
}

function AuthLanding({
  theme,
  onToggleTheme,
  onAuth,
}: {
  theme: string;
  onToggleTheme: () => void;
  onAuth: (mode: AuthMode) => void;
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <VideoBackground />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <BrandWordmark onClick={() => {}} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-xl text-center">
          <h1 className="heading text-4xl leading-tight sm:text-5xl">
            Your wardrobe, everywhere.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-muted">
            Save your pieces, build outfits, and get color-matched suggestions.
            Log in to access your closet on any device.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button onClick={() => onAuth("signup")} className="!px-6 !py-2.5">
              Create account
            </Button>
            <Button
              variant="outline"
              onClick={() => onAuth("login")}
              className="!px-6 !py-2.5"
            >
              Log in
            </Button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-line py-6 text-center text-xs text-muted">
        Log in or create an account to sync your wardrobe across devices.
      </footer>
    </div>
  );
}

function AppShellInner() {
  const {
    view,
    setView,
    theme,
    setTheme,
    profile,
    authUser,
    authChecked,
    passwordRecovery,
  } = useWardrobe();
  const [authModal, setAuthModal] = useState<AuthMode | null>(null);

  // The app requires an account. Without Supabase configured, login is
  // impossible, so we fall back to the ungated app for local/dev use.
  const gated = isSupabaseConfigured();
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  // Restoring the session — avoid flashing the login screen for signed-in users.
  if (gated && !authChecked) {
    return (
      <>
        <ThemeEffect />
        <AuthGateSplash />
      </>
    );
  }

  // Signed out (and not mid password-recovery) — show the sign-in landing.
  if (gated && !authUser && !passwordRecovery) {
    return (
      <>
        <ThemeEffect />
        <AuthLanding theme={theme} onToggleTheme={toggleTheme} onAuth={setAuthModal} />
        {authModal && (
          <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <ThemeEffect />
      <ShareLinkLoader />

      <header className="sticky top-0 z-40 border-b border-line bg-background">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-4 px-4 py-4 sm:gap-8 sm:px-6 sm:py-5">
          <BrandWordmark onClick={() => setView("wardrobe")} />

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
                <SyncBadge />
              </div>

              {authUser ? (
                <ProfileAvatar
                  profile={profile}
                  size={34}
                  active={view === "settings"}
                  onClick={() => setView("settings")}
                />
              ) : (
                <div className="flex items-center gap-2 pb-0.5">
                  <button
                    type="button"
                    onClick={() => setAuthModal("login")}
                    className="text-sm font-medium text-muted transition-colors hover:text-foreground"
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthModal("signup")}
                    className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
                  >
                    Sign up
                  </button>
                </div>
              )}

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
        {authUser
          ? `Signed in as ${authUser.email} — wardrobe synced to the cloud.`
          : "Use the app locally, or sign up to sync your wardrobe across devices."}
      </footer>

      {authModal && !passwordRecovery && (
        <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />
      )}

      {passwordRecovery && <ResetPasswordModal />}
    </>
  );
}

export function AppShell() {
  return (
    <AuthProvider>
      <AppShellInner />
    </AuthProvider>
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
