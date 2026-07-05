"use client";

import Link from "next/link";
import type { AuthMode } from "../AuthModal";

const linkCls = "transition-colors hover:text-white";
const loginCls = "text-sm text-white/80 transition-colors hover:text-white";
const signupCls =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90";

/**
 * Shared fixed nav for the public landing pages. On the home page `onAuth`
 * opens the auth modal in place; on the other pages the auth actions route
 * back to home with an intent param the home page reads on mount.
 */
export function LandingNav({
  onAuth,
  active,
}: {
  onAuth?: (mode: AuthMode) => void;
  active?: "how-it-works";
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="brand-wordmark leading-none"
          style={{ textShadow: "none" }}
        >
          <span
            className="brand-wordmark-kicker"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Your Personal
          </span>
          <span
            className="brand-wordmark-name"
            style={{ color: "#ffffff", fontSize: "1.25rem" }}
          >
            Wardrobe
          </span>
        </Link>

        <nav className="hidden gap-7 text-sm sm:flex">
          <Link
            href="/how-it-works"
            className={`${linkCls} ${active === "how-it-works" ? "text-white" : "text-white/70"}`}
          >
            How it works
          </Link>
        </nav>

        <div className="flex items-center gap-3">
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
