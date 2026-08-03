"use client";

import { useEffect, useMemo, useState } from "react";
import { isRenderPath, signedPrivateUrl, signedRenderUrls } from "@/lib/supabase/private-storage";

/**
 * AJA-275 — resolve saved try-on render paths into displayable signed URLs.
 *
 * Renders live in a PRIVATE bucket, so unlike garment images there is no URL to
 * put straight in an `<img>`; each path has to be signed. Three things this handles
 * that a naive per-card `useEffect` would not:
 *
 *  1. ONE request for the whole grid. Signing per card would fire a request per
 *     outfit on every mount of the Looks screen.
 *  2. Re-signing when the screen comes back. The URLs expire (10 min), and on iOS
 *     the app sits backgrounded for hours — coming back to a grid of broken
 *     thumbnails is exactly the "stopped working for no reason" failure the path-
 *     not-URL rule exists to avoid, just moved into memory.
 *  3. Never persisting the result. The map is component state and dies with it.
 *
 * Returns a path -> url map. Paths that failed to sign are simply absent, so the
 * caller falls back to the board thumbnail rather than showing a broken image.
 */
export function useSavedRenderUrls(paths: (string | undefined)[]): Record<string, string> {
  // Stable key so the effect re-runs when the SET of paths changes, not on every
  // render of a new array literal.
  const key = useMemo(
    () => [...new Set(paths.filter(isRenderPath))].sort().join("|"),
    [paths],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    // Nothing to sign. Deliberately no setState here — clearing the map in the
    // effect body trips react-hooks/set-state-in-effect, and it isn't needed:
    // the hook gates its return on `key`, so a stale map is never handed out.
    if (!key) return;
    let alive = true;
    const list = key.split("|");
    // setState lands in a promise callback, not the effect body — the repo's
    // react-hooks/set-state-in-effect rule is a static check on the body.
    const resolve = () => {
      void signedRenderUrls(list).then((m) => {
        if (alive) setUrls(m);
      });
    };
    resolve();

    // Backgrounded tabs/apps outlive the TTL; re-sign on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") resolve();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);

  // Gate on `key` so that when every render path disappears the caller sees an
  // empty map immediately, without a state write. Keeping the previous map while a
  // re-sign is in flight is intentional: paths that survived the change keep their
  // thumbnail instead of flickering back to the board.
  return key ? urls : EMPTY;
}

/** Module-level so the empty case is referentially stable across renders. */
const EMPTY: Record<string, string> = {};

/**
 * AJA-276 — single-path variant that also reports FAILURE.
 *
 * The batch hook above deliberately omits paths it couldn't sign, which is right for
 * a grid (one bad row falls back to a board thumbnail) but wrong for a screen whose
 * whole job is showing one image: "absent" there is indistinguishable from "still
 * signing", so a dead pointer would show a loading shimmer forever with no
 * explanation. This separates the two so the caller can say so and offer Remove.
 *
 * Same `visibilitychange` re-sign as the batch version, because a settings screen can
 * sit open far longer than the 600s TTL.
 */
export function usePrivateImageUrl(path: string | undefined): {
  url?: string;
  failed: boolean;
} {
  const [state, setState] = useState<{ url?: string; failed: boolean }>({ failed: false });

  useEffect(() => {
    // No setState in the effect body — react-hooks/set-state-in-effect is a static
    // check on the body, and the return below is gated on `path` anyway.
    if (!path) return;
    let alive = true;
    const resolve = () => {
      void signedPrivateUrl(path).then((u) => {
        if (alive) setState(u ? { url: u, failed: false } : { failed: true });
      });
    };
    resolve();
    const onVisible = () => {
      if (document.visibilityState === "visible") resolve();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path]);

  return path ? state : NO_IMAGE;
}

/** Referentially stable "nothing to show, nothing wrong" result. */
const NO_IMAGE = { failed: false } as const;
