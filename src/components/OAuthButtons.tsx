"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/platform";
import { authErrorMessage } from "@/lib/supabase/auth";
import {
  oauthSupported,
  signInWithProvider,
  type OAuthProvider,
} from "@/lib/supabase/oauth";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width={18} height={18} aria-hidden className="shrink-0">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 384 512" width={16} height={16} fill="currentColor" aria-hidden className="shrink-0">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

/**
 * "Continue with Google / Apple" buttons (AJA-194). Shared by the web AuthModal
 * and the native sign-in gate. On success the view changes on its own — native
 * signs in via the deep-link handler, web via a full-page redirect — so we keep
 * the spinner up rather than clearing it.
 */
export function OAuthButtons({ divider = true }: { divider?: boolean }) {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState("");
  // Web works immediately; native only once the build has the deep-link scheme.
  const [supported, setSupported] = useState<boolean | null>(() =>
    isNativeApp() ? null : true,
  );

  useEffect(() => {
    if (supported !== null) return;
    let alive = true;
    oauthSupported().then((s) => {
      if (alive) setSupported(s);
    });
    return () => {
      alive = false;
    };
  }, [supported]);

  const go = async (provider: OAuthProvider) => {
    setError("");
    setBusy(provider);
    try {
      await signInWithProvider(provider);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  };

  const base =
    "flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 text-sm font-medium transition-opacity disabled:opacity-50";

  // Hidden on native builds without the deep-link scheme (< 1.1.0) so the
  // buttons never dead-end while the web is deployed ahead of the App Store build.
  if (!supported) return null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => go("google")}
        disabled={busy !== null}
        className={`${base} border border-line bg-surface text-foreground hover:opacity-90`}
      >
        <GoogleIcon />
        {busy === "google" ? "Opening…" : "Continue with Google"}
      </button>
      <button
        type="button"
        onClick={() => go("apple")}
        disabled={busy !== null}
        className={`${base} bg-black text-white hover:opacity-90`}
      >
        <AppleIcon />
        {busy === "apple" ? "Opening…" : "Continue with Apple"}
      </button>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {divider && (
        <div className="flex items-center gap-3 pt-1 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
    </div>
  );
}
