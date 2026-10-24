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
import {
  deletePrivateImage,
  privateObjectExists,
  signedPrivateUrl,
  spinPathFor,
} from "@/lib/supabase/private-storage";
import { makeSpin } from "@/lib/tryon-spin";

/** Median measured make. The bar approaches 99 asymptotically and never claims 100 early. */
const TYPICAL_MS = 28_000;
const TAU = TYPICAL_MS / 2.4;

type Status = "idle" | "making" | "loading" | "ready" | "error";

/** AJA-308 — messages that mean "a spin may still be on its way" (from `makeSpin`, the
 *  route's 409, and the not-found reply below), as opposed to a failure that's final. */
const STILL_COMING = /Lost the connection|Still filming|Not there yet/;

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
  /** The spin path the held frames were loaded from. Frames only count while this matches
   *  the look's current spinPath — replacing the render clears spinPath, and a spin of the
   *  old render must never show on top of the new one. State, not a ref: it's read in render. */
  const [framesPath, setFramesPath] = useState<string | null>(null);
  const framesRef = useRef<SpinFrames | null>(null);
  /** False once the screen has unmounted — a late load must release, not store. */
  const alive = useRef(true);
  /** AJA-305 — in-hook guard on the $0.61 action: a second `make()` while one is in flight
   *  is dropped here, whatever the UI above does. Read in the callback only, never in render. */
  const makingRef = useRef(false);
  /** AJA-308 — one look-up at a time for a spin whose request died. Callback-only, like the above. */
  const probingRef = useRef(false);

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
      setFrames(next);
      setFramesPath(path);
      old?.release();
      setStatus("ready");
    } catch {
      // The app's own copy, never e.message — a load can reject with raw browser text.
      setError("Couldn't load the spin.");
      setStatus("error");
    }
  }, []);

  /** Frames are live only for the spin the look currently points at. */
  const live = !!frames && framesPath === spinPath;

  /** AJA-308 — the look has a render but no spin: maybe a make finished on the server after
   *  the phone lost the request. Its clip sits under the render's own name; attach it if so.
   *  A free storage HEAD, own folder only. Re-reads the look after the await: if the render
   *  changed or a spin got attached meanwhile, the find is stale and ignored. */
  const recover = useCallback(async () => {
    if (!outfitId || !renderPath || probingRef.current || makingRef.current) return;
    const candidate = spinPathFor(renderPath);
    if (!candidate) return;
    probingRef.current = true;
    try {
      const found = await privateObjectExists(candidate);
      if (!alive.current) return;
      if (!found) {
        // Only answers a question someone asked: after a lost connection (or a "still
        // filming" 409) the message on screen says "reopen 360°", and without this it would
        // just sit there as if the check never ran. Any OTHER message — the day's limit, a
        // missing photo, a failed film — is left alone: nothing is filming in those cases.
        setError((shown) =>
          shown && STILL_COMING.test(shown) ? "Not there yet — it may still be filming. Try again in a moment." : shown,
        );
        return;
      }
      const cur = useWardrobe.getState().outfits.find((o) => o.id === outfitId);
      if (!cur || cur.tryOnRenderPath !== renderPath || cur.spinPath || makingRef.current) return;
      setOutfitSpin(outfitId, candidate);
      await load(candidate);
    } finally {
      probingRef.current = false;
    }
  }, [outfitId, renderPath, setOutfitSpin, load]);

  /** Switching to 360° (or "Try loading it again"): show an existing spin, free. Never
   *  generates. Reloads whenever the held frames aren't live, whatever failed before. With
   *  no spin on the look, looks for one a lost request left behind. */
  const open = useCallback(() => {
    if (live || status === "loading" || status === "making") return;
    if (spinPath) void load(spinPath);
    else void recover();
  }, [spinPath, live, status, load, recover]);

  const make = useCallback(async () => {
    if (!outfitId || !renderPath || makingRef.current) return;
    makingRef.current = true;
    // AJA-308 — a look that already has a spin is asking for a NEW one ("Make a new spin");
    // without one, the route may answer with a clip a lost request left behind, free.
    const fresh = !!useWardrobe.getState().outfits.find((o) => o.id === outfitId)?.spinPath;
    setStatus("making");
    setError(null);
    setProgress(0);
    setMakingSince(Date.now());
    try {
      const path = await makeSpin(renderPath, { fresh });
      // Read the look as it is NOW, not as it was at the tap: the render can be replaced
      // (or the look deleted) during the ~30s make.
      const cur = useWardrobe.getState().outfits.find((o) => o.id === outfitId);
      setMakingSince(null);
      if (!cur || cur.tryOnRenderPath !== renderPath) {
        // Filmed from a render that's gone — attaching it would show the old render's spin
        // on the new one. Drop the clip.
        void deletePrivateImage(path);
        setStatus("idle");
        return;
      }
      const previous = cur.spinPath;
      setOutfitSpin(outfitId, path);
      if (previous && previous !== path) void deletePrivateImage(previous);
      await load(path);
    } catch (e) {
      setMakingSince(null);
      const msg = e instanceof Error ? e.message : "Couldn't film this look. Try again.";
      if (/isn't configured/i.test(msg)) setUnavailable(true);
      setError(msg);
      setStatus("error");
    } finally {
      // Every exit — success, stale-drop, failure — frees the guard.
      makingRef.current = false;
    }
  }, [outfitId, renderPath, setOutfitSpin, load]);

  // What the panel sees. Busy states pass through. With live frames, a failed make (or any
  // error) leaves the good turntable up and the message under it; without them, a stale or
  // cleared spin falls back to the front-only canvas by itself ("idle", or "error" if
  // there's a current error). No state is reset in an effect.
  const busy = status === "making" || status === "loading";
  const exposedStatus: Status = busy ? status : live ? "ready" : error ? "error" : "idle";

  return {
    available,
    status: exposedStatus,
    progress,
    frames: live ? frames : null,
    error,
    hasSpin: !!spinPath,
    open,
    make: () => void make(),
  };
}
