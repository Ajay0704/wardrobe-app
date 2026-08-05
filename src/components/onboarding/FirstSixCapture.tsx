"use client";

/**
 * First Six — the guided capture that follows the style quiz (AJA-277).
 *
 * WHY SIX, AND WHY THIS ORDER. Measured against a real 173-item closet with the app's own
 * `suggestLooks`, 400 trials per cell (`scripts/measure-small-closets.mts`): capture steered
 * to fill the CORE SLOTS first yields a wearable outfit 94% of the time at six pieces in warm
 * weather, versus ~30% for the unguided "photograph whatever you grabbed" behaviour. Six is
 * the knee of the curve — 81% at five, 98% at ten — so the ask stops at six rather than
 * pushing on. Cold weather tops out near 52% at six, which is why the payoff screen offers
 * and never promises.
 *
 * SHOES ARE ASKED THIRD, DELIBERATELY. Of every ten-item closet that could not produce an
 * outfit, 29.9% were missing shoes — the single biggest blocker, and about triple the next
 * one. Shoes are also ~10% of a real closet, so unguided capture misses them a third of the
 * time. Putting them at the end would place the critical slot exactly where drop-off is
 * highest.
 *
 * THE COPY NAMES A MOST-WORN PIECE each time. That is the strategy long-tenure users of other
 * wardrobe apps invented for themselves and then recommended to each other in public threads
 * ("I started with the things I wear most often, then added others over a few months"). No
 * shipped app in the category teaches it.
 *
 * PROGRESS IS STATED TO-DATE ONLY — "3 pieces in", never "3 of 6", and no bar. Villar et al.
 * 2013 (meta-analysis, 32 randomised experiments): an indicator that makes progress look slow
 * raises drop-off odds 1.56x (p=.001). Koo & Fishbach 2008: when commitment is uncertain,
 * accumulated framing motivates and remaining framing demotivates. Barasz et al. 2017
 * (pretest N=273, d=0.80): identical contents feel markedly less complete inside a container
 * with visible empty slots — so there is no six-slot grid waiting to be filled.
 *
 * MOTION (apple-design). Response lives on pointer-down, not release. A captured garment
 * FLIES from the viewfinder into its place in the strip via a FLIP transform, because a piece
 * that teleports into a list does not read as "that went into my closet" — §7 spatial
 * consistency and §8 hinting in the direction of the outcome. Only `transform`/`opacity` are
 * animated (§11), and the flight is skipped outright under `prefers-reduced-motion` (§14)
 * rather than left to the global duration clamp.
 */

import { Capacitor } from "@capacitor/core";
import { Camera } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cutout } from "@/lib/cutout";
import { captureNativePhoto } from "@/lib/native-camera";
import { useWardrobe } from "@/lib/store";
import { resolveImageSource } from "@/lib/supabase/storage";
import type { Category } from "@/lib/types";
import { Button } from "../ui";

type Ask = {
  /** The slot this ask fills. Drives both the item's category and the gap-filling logic. */
  slot: Extract<Category, "top" | "bottom" | "shoes">;
  kicker: string;
  question: string;
  hint: string;
};

/**
 * Core-slots-first, round-robin: top, bottom, shoes, then a second of each. Depth in the core
 * slots is what creates variety — two tops x two bottoms is four outfits, one of each is one
 * outfit, and one outfit is not a product.
 */
const ASKS: Ask[] = [
  {
    slot: "top",
    kicker: "Piece one",
    question: "The top you've worn most this week",
    hint: "Lay it flat or hold it up. Wrinkles are fine.",
  },
  {
    slot: "bottom",
    kicker: "Piece two",
    question: "The jeans or trousers you reach for",
    hint: "The pair on top of the pile.",
  },
  {
    slot: "shoes",
    kicker: "Piece three",
    question: "The shoes you actually leave the house in",
    hint: "One pair. Not the special-occasion ones.",
  },
  {
    slot: "top",
    kicker: "Piece four",
    question: "One more top — something different",
    hint: "Different colour or weight, if you can.",
  },
  {
    slot: "bottom",
    kicker: "Piece five",
    question: "One more bottom",
    hint: "Anything you'd wear out of the house.",
  },
  {
    slot: "shoes",
    kicker: "Piece six",
    question: "One more pair of shoes",
    hint: "Last one. Then you're dressed.",
  },
];

const SLOT_NOUN: Record<Ask["slot"], string> = {
  top: "a top",
  bottom: "a bottom",
  shoes: "shoes",
};

/** A gap-filling ask, used when a slot is still empty at the end (or after the no-photo path). */
function fillAsk(slot: Ask["slot"]): Ask {
  return {
    slot,
    kicker: "One more thing",
    question:
      slot === "shoes"
        ? "Now the shoes you wear most"
        : `Now ${SLOT_NOUN[slot]} to go with it`,
    hint: "This is the piece that unlocks the rest.",
  };
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function FirstSixCapture({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const addItem = useWardrobe((s) => s.addItem);
  const authUser = useWardrobe((s) => s.authUser);

  const [step, setStep] = useState(0);
  /** Set when a core slot is still empty — overrides the scripted ask (see fillAsk). */
  const [fill, setFill] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Thumbnails of what this session has captured. Drives the to-date counter and the strip. */
  const [taken, setTaken] = useState<{ url: string; slot: Ask["slot"] }[]>([]);
  /** The just-captured cutout, held in the viewfinder for the flight to the strip. */
  const [landing, setLanding] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const stripEndRef = useRef<HTMLDivElement | null>(null);
  const flyerRef = useRef<HTMLDivElement | null>(null);

  const ask = fill ?? ASKS[Math.min(step, ASKS.length - 1)];

  /**
   * Core slots still empty, given the slots captured so far.
   *
   * Takes the list rather than reading `taken`, because the decision is made inside the same
   * handler that just captured a piece — `taken` hasn't re-rendered yet at that point. Doing
   * this here rather than in an effect also satisfies `react-hooks/set-state-in-effect`,
   * which the repo enforces strictly.
   */
  const gapsAfter = useCallback(
    (slots: Ask["slot"][]) =>
      (["top", "bottom", "shoes"] as const).filter((s) => !slots.includes(s)),
    [],
  );

  /**
   * FLIP the captured cutout from the viewfinder into its slot in the strip.
   *
   * Measured before and after in the same frame, then transformed from the OLD rect to the new
   * one — so the piece appears to travel rather than cut. Runs on a clone positioned in the
   * viewport so it can cross the two containers' overflow without being clipped.
   */
  const flyToStrip = (url: string) =>
    new Promise<void>((resolve) => {
      const from = viewfinderRef.current?.getBoundingClientRect();
      const to = stripEndRef.current?.getBoundingClientRect();
      if (!from || !to || prefersReducedMotion()) return resolve();

      const flyer = document.createElement("div");
      flyer.style.cssText = [
        "position:fixed",
        `left:${from.left}px`,
        `top:${from.top}px`,
        `width:${from.width}px`,
        `height:${from.height}px`,
        "z-index:80",
        "pointer-events:none",
        "will-change:transform,opacity",
        "display:flex",
        "align-items:center",
        "justify-content:center",
      ].join(";");
      const img = document.createElement("img");
      img.src = url;
      img.style.cssText = "max-width:74%;max-height:70%;object-fit:contain";
      flyer.appendChild(img);
      document.body.appendChild(flyer);
      flyerRef.current = flyer;

      // Scale/translate so the flyer's centre lands on the strip slot's centre.
      const sx = to.width / from.width;
      const sy = to.height / from.height;
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);

      requestAnimationFrame(() => {
        // The iOS curve the rest of the app uses — critically damped, no overshoot, because
        // nothing here carried momentum (apple-design §4: bounce is earned by a flick).
        flyer.style.transition =
          "transform 420ms cubic-bezier(.32,.72,0,1), opacity 420ms ease";
        flyer.style.transform = `translate(${dx}px,${dy}px) scale(${Math.max(sx, sy)})`;
        flyer.style.opacity = "0.85";
      });
      const cleanup = () => {
        flyer.remove();
        flyerRef.current = null;
        resolve();
      };
      flyer.addEventListener("transitionend", cleanup, { once: true });
      // Never strand the flow on a dropped transitionend (backgrounded tab, etc).
      window.setTimeout(cleanup, 600);
    });

  useEffect(() => () => flyerRef.current?.remove(), []);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const src = await resolveImageSource(file, authUser?.id ?? null);
      // The slot is already known from the ask, so this skips garment DETECTION entirely —
      // faster and more reliable than the general import path, which has to guess what it's
      // looking at. Cut out only.
      const cut = await cutout(src, authUser?.id ?? null);
      setLanding(cut.url);
      await flyToStrip(cut.url);

      addItem({
        name: "",
        category: ask.slot,
        color: "#808080",
        seasons: [],
        tags: [],
        wishlist: false,
        imageUrl: cut.url,
        cutoutImageUrl: cut.url,
        cutoutEngine: cut.engine,
      } as Parameters<typeof addItem>[0]);

      setTaken((t) => [...t, { url: cut.url, slot: ask.slot }]);
      setLanding(null);

      // Slots owned once this capture counts — the basis for every decision below.
      const slots = [...taken.map((t) => t.slot), ask.slot];
      const gaps = gapsAfter(slots);

      if (fill) {
        // Filling a gap: done as soon as the last empty core slot closes.
        if (gaps.length) setFill(fillAsk(gaps[0]));
        else {
          setFill(null);
          onDone();
        }
        return;
      }

      const next = step + 1;
      setStep(next);
      if (next < ASKS.length) return;
      // Six asked and answered. A slot can still be empty if the user skipped one earlier,
      // and an outfit needs all three — so name the missing one instead of handing over a
      // closet the engine can't dress.
      if (gaps.length) setFill(fillAsk(gaps[0]));
      else onDone();
    } catch (e) {
      setLanding(null);
      setError(
        e instanceof Error && e.message
          ? `Couldn't use that photo — ${e.message}`
          : "Couldn't use that photo. Try another.",
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Native camera when we're in the app; a file input everywhere else. Gated on the plugin
   * being present in THIS binary, not on a UA check — an older build without the Camera
   * plugin falls back to `<input capture>`, which merely flashes and exits in WKWebView.
   */
  async function capture() {
    if (busy) return;
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Camera")) {
      try {
        const file = await captureNativePhoto();
        if (file) await handleFile(file);
        return;
      } catch {
        /* fall through to the input */
      }
    }
    fileRef.current?.click();
  }

  const count = taken.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none pt-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-muted">
            {ask.kicker}
          </p>
          {/* To-date only. No total, no percentage, no bar — see the header note. */}
          {count > 0 && (
            <p className="text-[13px] font-semibold text-muted">
              {count} {count === 1 ? "piece" : "pieces"} in
            </p>
          )}
        </div>
        <h2 className="heading mt-2 text-2xl">{ask.question}</h2>
        <p className="mt-2 text-[15px] leading-snug text-muted">{ask.hint}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <button
          type="button"
          onClick={capture}
          aria-label={`Capture: ${ask.question}`}
          disabled={busy}
          className="group my-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-3
            rounded-[22px] border-[1.5px] border-dashed border-line bg-surface-2
            transition-transform duration-100 ease-out active:scale-[0.985]
            disabled:opacity-70"
        >
          <div
            ref={viewfinderRef}
            className="flex h-full w-full flex-col items-center justify-center gap-3"
          >
            {landing ? (
              <Image
                src={landing}
                alt=""
                width={220}
                height={220}
                unoptimized
                className="max-h-[70%] w-auto max-w-[74%] object-contain"
              />
            ) : (
              <>
                <span
                  className="flex h-[60px] w-[60px] items-center justify-center rounded-full
                    border border-line bg-surface"
                >
                  {busy ? (
                    <span
                      className="h-5 w-5 animate-spin rounded-full border-2 border-muted
                        border-t-transparent"
                    />
                  ) : (
                    <Camera size={26} strokeWidth={1.6} className="text-muted" />
                  )}
                </span>
                <span className="text-[14.5px] text-muted">
                  {busy ? "Cutting it out…" : "Tap to capture"}
                </span>
              </>
            )}
          </div>
        </button>

        {/* A growing row, never a grid of empty slots (Barasz d=0.80). */}
        <div className="flex min-h-[56px] flex-none items-center gap-2 overflow-x-auto">
          {taken.map((t, i) => (
            <span
              key={`${t.url}-${i}`}
              className="animate-canvas-pop flex h-[50px] w-[50px] flex-none items-center
                justify-center overflow-hidden rounded-[14px] border border-line bg-surface"
            >
              <Image
                src={t.url}
                alt=""
                width={50}
                height={50}
                unoptimized
                className="h-full w-full object-contain p-1"
              />
            </span>
          ))}
          {/* Flight destination. Zero-width once the strip has content, so it never shows as
              an empty slot — it only exists to be measured. */}
          <div ref={stripEndRef} className="h-[50px] w-[50px] flex-none opacity-0" aria-hidden />
        </div>
      </div>

      {error && (
        <p role="alert" className="flex-none pb-2 text-[13px] text-red-600">
          {error}
        </p>
      )}

      <div className="flex-none pb-6 pt-2">
        {fill ? (
          <p className="pb-2 text-center text-[13px] text-muted">
            Almost — this slot is what unlocks the rest.
          </p>
        ) : null}
        <Button variant="ghost" className="w-full" onClick={onSkip}>
          {count > 0 ? "Finish later" : "I don't have these to hand"}
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void handleFile(f);
        }}
      />
      {/* Announce arrivals for screen readers, since the visual signal is a flight. */}
      <p className="sr-only" aria-live="polite">
        {count > 0 ? `${count} pieces added` : ""}
      </p>
    </div>
  );
}
