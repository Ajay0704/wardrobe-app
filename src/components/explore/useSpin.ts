"use client";

/**
 * AJA-305 — the 360° spin for one saved look: make it, attach it, load it.
 *
 * Kept out of TryOnView, which is already ~490 lines of its own states. Nothing here runs
 * on mount: `open()` (switching to 360°) loads an existing spin for free, and only `make()`
 * (an explicit tap) spends money — TryOnView's rule.
 *
 * Saving is automatic. The route stores the clip and this attaches it the moment it
 * returns: a $0.61 result that vanished when you left the screen would be AJA-275 again.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSpinFrames, type SpinFrames } from "@/lib/spin-frames";
import { useWardrobe } from "@/lib/store";
import { deletePrivateImage, signedPrivateUrl } from "@/lib/supabase/private-storage";
import { makeSpin } from "@/lib/tryon-spin";

/** Median measured make. The bar approaches 99 asymptotically and never claims 100 early. */
const TYPICAL_MS = 28_000;
const TAU = TYPICAL_MS / 2.4;

type Status = "idle" | "making" | "loading" | "ready" | "error";

export function useSpin(outfitId?: string) {
  const authUser = useWardrobe((s) => s.authUser);
  const setOutfitSpin = useWardrobe((s) => s.setOutfitSpin);
  const renderPath = useWardrobe((s) =>
    outfitId ? s.outfits.find((o) => o.id === outfitId)?.tryOnRenderPath : undefined,
  );
  const spinPath = useWardrobe((s) =>
    outfitId ? s.outfits.find((o) => o.id === outfitId)?.spinPath : undefined,
  );

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<SpinFrames | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [makingSince, setMakingSince] = useState<number | null>(null);
  const loadedFor = useRef<string | null>(null);
  const framesRef = useRef<SpinFrames | null>(null);
  /** False once the screen has unmounted — a late load must release, not store. */
  const alive = useRef(true);

  const available =
    process.env.NEXT_PUBLIC_TRYON_SPIN === "1" && !!outfitId && !!renderPath && !!authUser && !unavailable;

  // The making clock. setState in the interval callback, never the effect body.
  useEffect(() => {
    if (makingSince === null) return;
    const id = window.setInterval(() => {
      setProgress(1 - Math.exp(-(Date.now() - makingSince) / TAU));
    }, 100);
    return () => window.clearInterval(id);
  }, [makingSince]);

  // Free the frame blob URLs when the screen closes. The cleanup also flips `alive`, so a
  // load still in flight at that moment releases its frames instead of storing them.
  // (Strict Mode runs mount → cleanup → mount, so mount re-arms it.)
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      framesRef.current?.release();
    };
  }, []);

  const load = useCallback(async (path: string) => {
    setStatus("loading");
    setProgress(0);
    setError(null);
    try {
      const url = await signedPrivateUrl(path);
      if (!url) throw new Error("Couldn't load the spin.");
      const next = await loadSpinFrames(url, setProgress);
      if (!alive.current) {
        next.release();
        return;
      }
      // Swap first, release the old set after: nothing renders from a released set.
      const old = framesRef.current;
      framesRef.current = next;
      loadedFor.current = path;
      setFrames(next);
      old?.release();
      setStatus("ready");
    } catch {
      // The app's own copy, never e.message — a load can reject with raw browser text.
      setError("Couldn't load the spin.");
      setStatus("error");
    }
  }, []);

  /** Switching to 360°: show an existing spin, free. Never generates. */
  const open = useCallback(() => {
    if (spinPath && loadedFor.current !== spinPath) void load(spinPath);
  }, [spinPath, load]);

  const make = useCallback(async () => {
    if (!outfitId || !renderPath) return;
    setStatus("making");
    setError(null);
    setProgress(0);
    setMakingSince(Date.now());
    try {
      const path = await makeSpin(renderPath);
      const previous = spinPath;
      setOutfitSpin(outfitId, path);
      if (previous && previous !== path) void deletePrivateImage(previous);
      setMakingSince(null);
      await load(path);
    } catch (e) {
      setMakingSince(null);
      const msg = e instanceof Error ? e.message : "Couldn't film this look. Try again.";
      if (/isn't configured/i.test(msg)) setUnavailable(true);
      setError(msg);
      setStatus("error");
    }
  }, [outfitId, renderPath, spinPath, setOutfitSpin, load]);

  return {
    available,
    status,
    progress,
    frames,
    error,
    hasSpin: !!spinPath,
    open,
    make: () => void make(),
  };
}
