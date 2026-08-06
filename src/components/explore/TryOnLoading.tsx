"use client";

import { useEffect, useState } from "react";
import type { TryOnGarment } from "@/lib/tryon";

/**
 * AJA-280 — the try-on wait, made worth watching.
 *
 * A render measures ~19-23s. The old state was a spinner and "Takes a few seconds",
 * which is a twenty-second stare at an abstract circle: it conveys nothing about
 * whose look is being made or how far along it is, and it makes a slow-but-normal
 * render feel broken.
 *
 * The idea: SHOW THE WORK, using assets already in memory. The user's own photo sits
 * behind, blurred and dimmed so it plainly reads as the input; their garments then
 * land onto anatomical positions one at a time; then a soft band sweeps the frame
 * while the model finishes. It mirrors what the request is actually doing, and it is
 * something only a wardrobe app can show — the content IS the loading state.
 *
 * HONESTY ABOUT PROGRESS. There is one HTTP request with no progress events, so a
 * server-truth percentage is impossible. Rather than invent one that stalls at 99%,
 * the bar is an explicit TIME estimate: it eases toward a ceiling and then holds,
 * never reverses, and after the median duration the copy stops implying imminence and
 * says so. The phase labels are the real signal, and each one is true when shown.
 */

/** Where a piece belongs on the body, as a share of frame height. */
const SLOTS: { re: RegExp; top: number; left?: number }[] = [
  { re: /(hat|cap|beanie|sunglass|glasses)/i, top: 0.09 },
  { re: /(jacket|coat|blazer|hoodie|cardigan|outerwear|vest|parka)/i, top: 0.33, left: 0.28 },
  { re: /(shirt|tee|tshirt|t-shirt|top|blouse|sweater|knit|polo|tank|dress|jersey)/i, top: 0.33 },
  { re: /(jean|trouser|pant|short|skirt|chino|legging|bottom|slack)/i, top: 0.58 },
  { re: /(shoe|sneaker|boot|heel|sandal|loafer|trainer|footwear)/i, top: 0.83 },
  { re: /(bag|tote|backpack|purse|clutch)/i, top: 0.52, left: 0.76 },
  { re: /(belt|watch|scarf|jewel|necklace|ring|glove|tie)/i, top: 0.46, left: 0.24 },
];

/**
 * Anatomical placement from the garment label, falling back to an even spread.
 *
 * A wrong slot here costs nothing — it is decorative, unlike the face crop, where a
 * wrong guess corrupts the render. So a cheap heuristic is the right trade, and the
 * fallback keeps unlabelled pieces evenly distributed rather than stacked.
 */
function place(label: string | undefined, i: number, n: number): { top: number; left: number } {
  const hit = label ? SLOTS.find((s) => s.re.test(label)) : undefined;
  if (hit) return { top: hit.top, left: hit.left ?? 0.5 };
  return { top: 0.3 + (n === 1 ? 0.2 : (i / Math.max(1, n - 1)) * 0.5), left: 0.5 };
}

const FIRST_LAND_MS = 1_200;
/** Median measured render. Past this, stop implying it's nearly done. */
const TYPICAL_MS = 21_000;
/** The bar's ceiling — it must never read as finished while we're still waiting. */
const CEILING = 0.93;

/**
 * Pieces are paced ACROSS the wait, not rushed at the start.
 *
 * The first version landed all of them inside ~2s and then held one unchanging label
 * for the remaining nineteen — which is a spinner with extra steps. Spreading them out
 * keeps something genuinely new happening deep into the wait, and each landing is a
 * true statement: that piece is in the request.
 */
function staggerFor(n: number): number {
  if (n <= 1) return 0;
  return Math.min(3_200, Math.max(1_100, (TYPICAL_MS * 0.6) / n));
}

export function TryOnLoading({
  subject,
  garments,
}: {
  /** The user's photo, or null when rendering a generic model. */
  subject: string | null;
  garments: TryOnGarment[];
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    // setState from an interval callback, not the effect body — the repo's
    // react-hooks/set-state-in-effect rule is a static check on the body.
    const id = window.setInterval(() => setElapsed(Date.now() - started), 120);
    return () => window.clearInterval(id);
  }, []);

  const shown = garments.slice(0, 5);
  const stagger = staggerFor(shown.length);
  const landedCount = shown.filter((_, i) => elapsed >= FIRST_LAND_MS + i * stagger).length;
  const allLanded = landedCount >= shown.length;
  const lastLandAt = FIRST_LAND_MS + Math.max(0, shown.length - 1) * stagger;

  // Ease toward the ceiling, decelerating — fast early progress then a long tail is
  // how waits actually feel, and it means the bar is still visibly moving at 15s.
  const t = Math.min(1, elapsed / TYPICAL_MS);
  const pct = Math.round((1 - Math.pow(1 - t, 2.2)) * CEILING * 100);

  const phase = !subject
    ? allLanded
      ? "Lighting the scene"
      : "Setting up the model"
    : elapsed < FIRST_LAND_MS
      ? "Reading your photo"
      : elapsed > TYPICAL_MS + 9_000
        ? "Still working — this one's slow"
        : allLanded
          ? "Lighting the scene"
          : `Fitting the ${shown[Math.max(0, landedCount - 1)]?.label ?? "piece"}`;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* The input, plainly marked as such: blurred, desaturated and dark enough that
          nobody could mistake it for the finished render. */}
      {subject ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={subject}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-[6px] saturate-[0.6]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-surface-2 to-surface" />
      )}

      {/* Pieces landing on the body.
          The closet's garment images are ghost-mannequin cutouts on OPAQUE WHITE
          (`beautifiedImageUrl`), so laid over the photo they first rendered as a stack
          of white cards — it looked like a bug.
          `mix-blend-multiply` fixed that and was wrong: multiply darkens by luminance,
          so it erases pale garments along with the background. A cream sneaker went
          almost invisible in testing, and a white shirt would disappear completely.
          A radial mask instead fades each image's edges, so the white background
          dissolves into the blurred photo while every garment — pale ones included —
          keeps its own colour. */}
      {shown.map((g, i) => {
        const { top, left } = place(g.label, i, shown.length);
        if (elapsed < FIRST_LAND_MS + i * stagger) return null;
        return (
          <div
            key={i}
            className="absolute aspect-[4/5] w-[21%] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.image}
              alt=""
              aria-hidden
              className="animate-tryon-land h-full w-full object-contain [mask-image:radial-gradient(closest-side,#000_62%,transparent_90%)]"
            />
          </div>
        );
      })}

      {/* Develop sweep — only once the pieces are on, so the two motions never
          compete for attention. */}
      {elapsed > lastLandAt + 260 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-tryon-sweep h-1/3 w-full bg-gradient-to-b from-transparent via-white/25 to-transparent" />
        </div>
      )}

      {/* Caption. Bottom-anchored over a scrim so it stays legible against any photo
          (apple-design §12: vibrancy over changing backgrounds — put contrast on a
          solid-ish layer rather than trusting grey text). */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/35 to-transparent px-4 pb-3 pt-10">
        <p
          aria-live="polite"
          className="text-center text-[13px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
        >
          {phase}
        </p>
        <div className="mx-auto mt-2 h-[3px] w-2/3 overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-white/90 transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
