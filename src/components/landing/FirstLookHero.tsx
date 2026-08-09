"use client";

/**
 * The signed-out hero — a playable board instead of a pitch (AJA-290).
 *
 * WHY. First value used to sit behind an account and five quiz questions: landing → sign up →
 * handle → department → goal → occasions → lean → snapshot → *then* the board. So the first thing
 * the app ever gave you arrived after everything it asked for, which is the inverted ratio the
 * Gain-Pain ledger describes ("we charge at signup and pay out at temptation") and the reason a
 * cold visitor has no way to find out whether any of this is for them.
 *
 * The board was already the right thing in the wrong place: it writes nothing to the store, takes
 * only a department, and runs off the static cutouts in `public/samples` — so it needed no
 * refactor to run out here, ahead of the gate.
 *
 * NO QUESTION FIRST. The department defaults to women's rather than being asked, because asking
 * would reinstate the exact thing this issue removes. The toggle is there for everyone else, and
 * whichever way it lands is carried into onboarding so the quiz does not ask again.
 */

import { useState } from "react";
import type { AuthMode } from "../AuthModal";
import { markFirstLookPlayed } from "@/lib/first-look";
import FirstLookGame from "../onboarding/FirstLookGame";
import { VideoPanel } from "../VideoPanel";

export function FirstLookHero({
  onAuth,
  sharedOutfit,
}: {
  onAuth: (mode: AuthMode) => void;
  sharedOutfit?: boolean;
}) {
  const [gender, setGender] = useState<"female" | "male">("female");

  return (
    <VideoPanel overlay={0.72} eager poster="/hero-poster.jpg" align="start" compact>
      {/*
       * Stacked on phones (the card is the page); side-by-side from `lg`, because the board is a
       * tall portrait surface and letting the copy sit above it on a wide screen squeezes the
       * board into a strip — the slot labels start colliding well before the fold.
       */}
      <div className="grid w-full gap-9 lg:grid-cols-[1fr_minmax(0,25rem)] lg:items-center lg:gap-14">
        <div className="text-center lg:text-left">
          {sharedOutfit && (
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white backdrop-blur">
              Someone shared an outfit with you — log in to view it.
            </div>
          )}

          {/* Sized down on phones: the card below has a fixed height, so every pixel the copy
              takes is a pixel off the board — and an h1 that overflows the fold defeats the point
              of putting something playable above it. */}
          <h1 className="text-[26px] font-bold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
            The home for everything you wear
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-white/70 lg:mx-0 lg:mt-4 lg:text-base">
            Make an outfit from six pieces.{" "}
            <span className="text-white/90">No account needed.</span>
          </p>

          {/* Department, not a question. Sits outside the card so the card stays a clean
              rendering of the app rather than a form. */}
          <div className="mt-4 inline-flex rounded-full border border-white/20 bg-white/10 p-0.5 backdrop-blur lg:mt-5">
            {(["female", "male"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                aria-pressed={gender === g}
                className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                  gender === g ? "bg-white text-neutral-900" : "text-white/75 hover:text-white"
                }`}
              >
                {g === "female" ? "Women's" : "Men's"}
              </button>
            ))}
          </div>

          {/* Desktop only: on a phone this would sit below the fold under a full-height card,
              so the stacked layout repeats it beneath the board instead. */}
          <p className="mt-7 hidden text-sm text-white/60 lg:block">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => onAuth("login")}
              className="font-medium text-white underline-offset-4 transition-colors hover:underline"
            >
              Log in
            </button>
          </p>
        </div>

        <div>
          {/*
           * Pinned to the light palette (.theme-light): this is a picture of the app, and on a
           * dark theme it would otherwise render charcoal-on-charcoal and vanish into the hero.
           * A definite height is required — the board is `aspect-[3/4] h-full`, so it sizes from
           * its container and collapses to nothing inside an auto-height parent. The cap keeps it
           * inside the viewport given VideoPanel's own `py-24`.
           */}
          <div
            className="theme-light mx-auto flex h-[calc(100dvh-22rem)] min-h-[25rem] max-h-[34rem]
              w-full max-w-md flex-col overflow-hidden rounded-3xl bg-surface px-5 text-foreground
              shadow-2xl ring-1 ring-white/10
              lg:h-[38rem] lg:max-h-[calc(100dvh-11rem)]"
          >
            <FirstLookGame
              // Remounts on toggle so a half-built outfit from the other department cannot
              // survive into a board whose pieces no longer exist.
              key={gender}
              shopGender={gender}
              ctaLabel="Make it yours"
              pendingLabel="Make an outfit to continue"
              onDone={() => {
                markFirstLookPlayed(gender);
                onAuth("signup");
              }}
            />
          </div>

          <p className="mt-5 text-center text-sm text-white/60 lg:hidden">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => onAuth("login")}
              className="font-medium text-white underline-offset-4 transition-colors hover:underline"
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    </VideoPanel>
  );
}
