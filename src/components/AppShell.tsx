"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { isNativeApp } from "@/lib/platform";
import { useWardrobe, type View } from "@/lib/store";
import { hasStoredSession, isSupabaseConfigured } from "@/lib/supabase/client";
import { AuthModal, type AuthMode } from "./AuthModal";
import { AuthProvider } from "./AuthProvider";
import { ProfileMenu } from "./ProfileMenu";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { ShareLinkLoader } from "./ShareLinkLoader";
import { SyncBadge } from "./SyncBadge";
import { ThemeEffect } from "./ThemeEffect";
import { VideoPanel } from "./VideoPanel";
import { LandingNav } from "./landing/LandingNav";
import { AppViews } from "./AppViews";
import { useIsNativeApp } from "./NativeAppClass";
import { NativeShell } from "./native/NativeShell";

const NAV: { view: View; label: string }[] = [
  { view: "today", label: "Today" },
  { view: "wardrobe", label: "Wardrobe" },
  { view: "builder", label: "Builder" },
  { view: "outfits", label: "Outfits" },
  { view: "calendar", label: "Calendar" },
  { view: "wishlist", label: "Wishlist" },
  { view: "travel", label: "Travel" },
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

function AuthLanding({
  onAuth,
  sharedOutfit,
}: {
  onAuth: (mode: AuthMode) => void;
  sharedOutfit?: boolean;
}) {
  return (
    <div className="relative bg-[#0b0d11] text-white">
      <LandingNav onAuth={onAuth} />

      <VideoPanel overlay={0.5} eager poster="/hero-poster.jpg">
        <div className="mx-auto max-w-2xl">
          {sharedOutfit && (
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white backdrop-blur">
              Someone shared an outfit with you — log in to view it.
            </div>
          )}
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            The home for everything you wear
          </h1>
          <p className="mx-auto mt-5 max-w-md text-white/70">
            Digitize your closet, build outfits, and get color-matched
            suggestions — synced across every device.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => onAuth("signup")}
              className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              Create account
            </button>
            <button
              type="button"
              onClick={() => onAuth("login")}
              className="rounded-lg border border-white/25 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Log in
            </button>
          </div>
          <div className="mt-14 text-sm text-white/60">
            <Link
              href="/how-it-works"
              className="transition-colors hover:text-white"
            >
              See how it works →
            </Link>
          </div>
        </div>
      </VideoPanel>

      <VideoPanel src="/bg-onitsuka.mp4" overlay={0.62} align="start">
        <div className="max-w-lg">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-accent">
            Outfit builder
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Build outfits visually
          </h2>
          <p className="mt-4 max-w-md text-white/70">
            Drag pieces together, see a live preview, and get a match score so
            nothing clashes.
          </p>
        </div>
      </VideoPanel>

      <VideoPanel src="/bg-goldengoose.mp4" overlay={0.6}>
        <div className="mx-auto max-w-xl">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-white/60">
            Anywhere, always
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Your closet, everywhere
          </h2>
          <p className="mx-auto mt-4 max-w-md text-white/70">
            Everything syncs to the cloud, so your wardrobe is with you on any
            device.
          </p>
          <div className="mt-8">
            <button
              type="button"
              onClick={() => onAuth("signup")}
              className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              Create account
            </button>
          </div>
        </div>
      </VideoPanel>
    </div>
  );
}

function AppShellInner() {
  const { view, setView, theme, setTheme, authUser, authChecked, passwordRecovery } =
    useWardrobe();
  const isNative = useIsNativeApp();
  // One-way latch: once the native shell is chosen, never fall back to website
  // chrome (item taps used to remount detection and flip the top nav back on).
  const [nativeLatched, setNativeLatched] = useState(() =>
    typeof window !== "undefined" ? isNativeApp() : false,
  );
  useEffect(() => {
    if (isNative || isNativeApp()) setNativeLatched(true);
  }, [isNative]);
  const showNative = nativeLatched || isNative || isNativeApp();
  const [sharedOutfit] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("outfit"),
  );
  const [authModal, setAuthModal] = useState<AuthMode | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const a = params.get("auth");
    if (a === "login" || a === "signup") return a;
    // A shared-outfit link → prompt login so it loads after sign-in.
    if (params.has("outfit")) return "login";
    return null;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    if (
      v === "today" ||
      v === "wardrobe" ||
      v === "builder" ||
      v === "outfits" ||
      v === "calendar" ||
      v === "wishlist" ||
      v === "travel" ||
      v === "insights" ||
      v === "settings"
    ) {
      setView(v);
    }
  }, [setView]);

  // The app requires an account. Without Supabase configured, login is
  // impossible, so we fall back to the ungated app for local/dev use.
  const gated = isSupabaseConfigured();

  // Only block on the splash when there's actually a stored session to restore.
  // Logged-out visitors (no token) skip it and see the landing immediately.
  if (gated && !authChecked && hasStoredSession()) {
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
        <AuthLanding onAuth={setAuthModal} sharedOutfit={sharedOutfit} />
        {authModal && (
          <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />
        )}
      </>
    );
  }

  // Native app (Capacitor iOS shell): logged-in users get the iOS-style chrome
  // with a bottom tab bar. The website keeps the header/footer chrome below.
  if (showNative) {
    return (
      <>
        <ThemeEffect />
        <ShareLinkLoader />
        <NativeShell />
        {authModal && !authUser && !passwordRecovery && (
          <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />
        )}
        {passwordRecovery && <ResetPasswordModal />}
      </>
    );
  }

  return (
    <>
      <ThemeEffect />
      <ShareLinkLoader />

      <header className="sticky top-0 z-40 border-b border-line bg-background pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-4 px-4 py-4 sm:gap-8 sm:px-6 sm:py-5">
          <BrandWordmark onClick={() => setView("today")} />

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
                <ProfileMenu />
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
        <AppViews />
      </main>

      <footer className="border-t border-line py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-muted">
        {authUser
          ? `Signed in as ${authUser.email} — wardrobe synced to the cloud.`
          : "Use the app locally, or sign up to sync your wardrobe across devices."}
      </footer>

      {authModal && !authUser && !passwordRecovery && (
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
