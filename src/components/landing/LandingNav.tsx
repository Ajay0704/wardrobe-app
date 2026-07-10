"use client";

import Link from "next/link";
import type { AuthMode } from "../AuthModal";

const linkCls = "text-sm transition-colors";
const loginCls = "text-sm text-muted transition-colors hover:text-foreground";
const signupCls =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90";

/**
 * Shared fixed nav for the public landing pages. Solid, theme-aware bar (white
 * in light mode, near-black in dark) so it's always legible over the video.
 * On the home page `onAuth` opens the auth modal in place; elsewhere the auth
 * actions route back to home with an intent param.
 */
export function LandingNav({
  onAuth,
  active,
}: {
  onAuth?: (mode: AuthMode) => void;
  active?: "how-it-works";
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-background pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="brand-wordmark leading-none">
          <span className="brand-wordmark-kicker">Your Personal</span>
          <span className="brand-wordmark-name" style={{ fontSize: "1.25rem" }}>
            Wardrobe
          </span>
        </Link>

        <div className="flex items-center gap-5 sm:gap-7">
          <Link
            href="/how-it-works"
            className={`${linkCls} ${
              active === "how-it-works"
                ? "text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            How it works
          </Link>

          {onAuth ? (
            <>
              <button type="button" onClick={() => onAuth("login")} className={loginCls}>
                Log in
              </button>
              <button type="button" onClick={() => onAuth("signup")} className={signupCls}>
                Create account
              </button>
            </>
          ) : (
            <>
              {/* Full navigation so the home page reads the auth intent on load. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/?auth=login" className={loginCls}>
                Log in
              </a>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/?auth=signup" className={signupCls}>
                Create account
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
