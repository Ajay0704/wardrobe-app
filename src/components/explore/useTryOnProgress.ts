"use client";

import { useEffect, useState } from "react";
import type { TryOnGarment } from "@/lib/tryon";

/**
 * AJA-280 — the shared clock for the try-on wait.
 *
 * Lifted out of the loading canvas because two surfaces need the same timing: the
 * canvas (which shows the phase and the estimate) and the garment strip below it (whose
 * tiles light up as each piece is fitted). One clock means they can never disagree.
 *
 * HONESTY ABOUT PROGRESS. One HTTP request, no progress events, so a server-truth
 * percentage is impossible. `pct` is an explicit TIME estimate, shaped so it cannot lie
 * in the two ways a fake percentage usually does: it approaches 99 asymptotically so it
 * never freezes at a round number, and it never reaches 100 until the render lands.
 */

/** Median measured render. `pct` is tuned to read ~90 here. */
const TYPICAL_MS = 21_000;
/** 1 - e^-2.4 = 0.909, so pct ≈ 90 at TYPICAL_MS and creeps from there. */
const TAU = TYPICAL_MS / 2.4;
const FIRST_MS = 1_100;

/**
 * Pieces are paced ACROSS the wait, not rushed into the first two seconds.
 * A single-garment outfit still gets a real window: returning 0 here used to collapse
 * the fitting stage to nothing, so the one piece was never named.
 */
function staggerFor(n: number): number {
  if (n <= 0) return 0;
  return Math.min(3_400, Math.max(1_200, (TYPICAL_MS * 0.62) / n));
}

/** Craft verbs for the tail, once every piece is on. Cycled, never repeated back to back. */
const FINISHING = ["Matching the light", "Settling the fabric", "Final touches"];
const FINISH_MS = 2_600;

export interface TryOnProgress {
  elapsed: number;
  /** How many pieces have been fitted so far. */
  taken: number;
  /** Whole-number estimate for the caption, 0-99. Never reaches 100 while waiting. */
  pct: number;
  phase: string;
}

export function useTryOnProgress(
  garments: TryOnGarment[],
  hasSubject: boolean,
  /** When the in-flight render began, or null when idle. */
  startedAt: number | null,
): TryOnProgress {
  // The caller owns the start time, because the caller is what starts the render.
  // An earlier version began counting when the SCREEN mounted, so time spent choosing
  // a photo counted against the render and the wait escalated nine seconds in. This
  // hook is now just a ticker over someone else's clock.
  // Elapsed is STATE, not `Date.now()` in the render body — the render must stay pure.
  // It carries the `at` it was measured against, so a reading left over from a previous
  // run can never leak into the next one: on "Try again" the old value would otherwise
  // show for one tick and flash a high percentage at zero seconds.
  const [clock, setClock] = useState<{ at: number; ms: number }>({ at: 0, ms: 0 });

  useEffect(() => {
    if (startedAt === null) return;
    // setState from an interval callback, not the effect body — the repo's
    // react-hooks/set-state-in-effect rule is a static check on the body.
    const id = window.setInterval(
      () => setClock({ at: startedAt, ms: Date.now() - startedAt }),
      100,
    );
    return () => window.clearInterval(id);
  }, [startedAt]);

  const elapsed = startedAt !== null && clock.at === startedAt ? clock.ms : 0;

  const n = Math.min(garments.length, 5);
  const stagger = staggerFor(n);
  const rawTaken = Math.min(n, Math.max(0, Math.floor((elapsed - FIRST_MS) / (stagger || 1)) + 1));
  const taken = elapsed < FIRST_MS ? 0 : rawTaken;

  // Asymptotic, so it is always still moving and never sits on a round lie.
  const pct = Math.min(99, Math.round(99 * (1 - Math.exp(-elapsed / TAU))));

  /**
   * Both stages key off the clock, not off `taken`. Gating the tail on `taken >= n`
   * was wrong: `taken` saturates at n one stagger BEFORE the fitting window closes, so
   * for that gap the finishing index went negative — and JS `%` keeps the sign, so
   * `FINISHING[-1]` was `undefined` and the caption rendered as a bare "78% · ".
   * Seen live on a real four-piece render.
   */
  const fittingUntil = FIRST_MS + stagger * n;
  const phase = !hasSubject
    ? "Styling on a model"
    : elapsed < FIRST_MS
      ? "Reading your photo"
      : elapsed < fittingUntil
        ? `Fitting the ${garments[Math.min(n - 1, Math.max(0, taken - 1))]?.label ?? "piece"}`
        : FINISHING[Math.floor((elapsed - fittingUntil) / FINISH_MS) % FINISHING.length];

  return {
    elapsed,
    taken,
    pct,
    phase,
  };
}
