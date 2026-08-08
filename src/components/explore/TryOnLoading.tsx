"use client";

import type { TryOnGarment } from "@/lib/tryon";
import type { TryOnProgress } from "./useTryOnProgress";

/**
 * AJA-280 — the try-on wait.
 *
 * A render measures 19-27s. A spinner for that long says nothing about whose look is
 * being made, and makes a slow-but-normal render feel broken.
 *
 * THE MISTAKE THAT TOOK FOUR BUILDS TO SEE. Every earlier version showed the user's
 * REFERENCE PHOTO resolving — dissolving, un-blurring, gathering out of grain. It looks
 * like generation, and it is a lie: the reference is an INPUT and the render is a
 * different picture. In the case that exposed it, the reference was a head-and-shoulders
 * portrait in a blue shirt and the render a full-length street shot in a black tee.
 * Twenty seconds watching the portrait sharpen, then a swap to something unrelated. No
 * amount of restyling fixes that — the subject was wrong.
 *
 * SO THE CANVAS SHOWS NOTHING. Not the reference, and not the garments either — a
 * flat-lay of the real pieces was built and rejected in favour of this. What is left is
 * the wait itself on the app's own stone surface, with the phase and an accent hairline
 * carrying all of the information, centred because there is no picture for a caption to
 * sit under. It asserts nothing, which is the whole argument: there IS no partial
 * result, because Gemini returns a single response with no intermediate frames, and
 * inventing one would be the same lie with better manners.
 *
 * The per-piece story lives in the garment strip below the canvas (`TryOnView`), which
 * is showing the real items anyway.
 */

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Three fields, built from `--accent` at low ELEMENT opacity rather than from
 * `--accent-soft`. In the light theme `--accent-soft` is #e8efe2 against a #f3f1ed
 * surface — a four-value difference, which rendered as a blank card on a phone. Opacity
 * on the element avoids needing colour-mix inside the gradient stops.
 *
 * The durations are deliberately co-prime: 7.3 / 9.1 / 11.7 seconds only realign after
 * minutes, so across a 27-second wait the composition never visibly repeats. That is
 * what keeps a loop from reading as a loop.
 */
const FIELDS = [
  { css: "radial-gradient(46% 34% at 30% 30%, var(--accent) 0%, transparent 68%)", op: 0.26, ms: 7300, rev: false },
  { css: "radial-gradient(38% 30% at 72% 58%, var(--accent) 0%, transparent 70%)", op: 0.17, ms: 9100, rev: true },
  { css: "radial-gradient(30% 24% at 52% 82%, var(--accent) 0%, transparent 72%)", op: 0.13, ms: 11700, rev: false },
];

export function TryOnLoading({
  progress,
  garments,
}: {
  progress: TryOnProgress;
  garments: TryOnGarment[];
}) {
  const { phase, pct } = progress;
  const still = prefersReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden bg-surface-2">
      {/* Blurred hard enough that no gradient edge is ever visible. */}
      <div className="absolute inset-0" style={{ filter: "blur(18px)" }}>
        {FIELDS.map((f, i) => (
          <div
            key={i}
            className={`absolute -inset-1/4 ${still ? "" : "animate-tryon-drift"}`}
            style={{
              background: f.css,
              opacity: f.op,
              animationDuration: `${f.ms}ms`,
              animationDirection: f.rev ? "reverse" : "normal",
            }}
          />
        ))}
      </div>

      {/* Caption, CENTRED rather than bottom-anchored. A caption belongs at the foot of
          a picture, and there is no picture here — bottom-anchored it left a tall empty
          plate with a line of type fallen to the floor. No scrim: nothing sits behind
          it, and a dark capsule on a stone ground would read as a foreign chip. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        <p aria-live="polite" className="text-center text-[12px] font-medium text-foreground">
          {phase}
        </p>
        {/* Progress as a hairline in the accent — how the app already draws emphasis. */}
        <div className="mt-2.5 h-px w-24 overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-accent transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <span className="sr-only">
        Generating a try-on with {garments.length} piece{garments.length === 1 ? "" : "s"}.
      </span>
    </div>
  );
}
