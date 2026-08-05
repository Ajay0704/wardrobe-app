"use client";

/**
 * The first-look game — the demo that replaced the fake starter closet (AJA-279).
 *
 * WHY THIS EXISTS. The old sample closet taught nobody anything: eight pieces were seeded into
 * the user's inventory at sign-up, onboarding never displayed them, and the first real photo
 * deleted them — so the only screen that ever showed them was a banner on Explore, which by
 * definition only reached someone who had skipped capture. Worse, they sat in the closet
 * *pretending to be the user's own clothes*.
 *
 * So the samples stop being inventory and become a thing you play with for thirty seconds. The
 * user is handed six pieces and an empty board and asked to make an outfit. Three taps, and they
 * have used the core feature of the product before answering anything about themselves.
 *
 * THE COUNT IS THE HOOK, AND IT IS HONEST. Six pieces hold `tops × bottoms` = four outfits, and
 * swapping a piece finds another one, so the counter climbs to "4 of 4 looks found". Shoes
 * deliberately do NOT multiply the total: swapping footwear is a variation on a look, not another
 * look, and claiming eight would be a number the user can disprove by eye. It is also exactly the
 * arithmetic `FirstOutfit` uses for their real closet, so the promise made here is the promise
 * kept two screens later — and it is the argument for asking for six photos instead of sixty.
 *
 * NOT INVENTORY. Nothing here is written to the store. That is the entire point: no badging, no
 * clearing, no migration, and no chance of a drawn or borrowed garment being presented as
 * something the user owns.
 *
 * MOTION (apple-design). Response is on pointer-down; the piece TRAVELS from the tray to its slot
 * via a FLIP transform rather than teleporting, because the arc is what makes it read as "that
 * went onto the board" (§7 spatial consistency, §8 hinting at the outcome). Only `transform` and
 * `opacity` animate (§11), and the flight is skipped outright under `prefers-reduced-motion` (§14)
 * instead of being left to a global duration clamp.
 */

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { distinctLookCount } from "@/lib/looks";
import { Button } from "../ui";

type Slot = "top" | "bottom" | "shoes";

const ORDER: Slot[] = ["top", "bottom", "shoes"];

const SLOT_LABEL: Record<Slot, string> = { top: "Top", bottom: "Bottom", shoes: "Shoes" };

/**
 * Board placement, mirroring `CanvasBuilderView.placeLook` (and `FirstOutfit`), so the layout the
 * user learns here is the one they meet in the real outfit builder. Percentages are of board
 * width/height; the bottom sits flush left because `placeLook` computes a negative x and clamps.
 */
const SLOT_BOX: Record<Slot, { left: string; top: string; width: string }> = {
  top: { left: "3%", top: "6%", width: "52%" },
  bottom: { left: "0", top: "50%", width: "58.24%" },
  shoes: { left: "56%", top: "70%", width: "36%" },
};

type Piece = { slot: Slot; slug: string; name: string };

/**
 * The demo six, per department: two tops, two bottoms, two pairs of shoes — the shape that makes
 * four looks. These are the cutouts already in `public/samples`, which is why this needs no new
 * artwork: they are what a real catalogued item looks like in this app.
 */
const SETS: Record<"women" | "men", { dir: string; pieces: Piece[] }> = {
  women: {
    dir: "/samples/women",
    pieces: [
      { slot: "top", slug: "white-shirt", name: "White shirt" },
      { slot: "top", slug: "camel-sweater", name: "Camel sweater" },
      { slot: "bottom", slug: "blue-jeans", name: "Blue jeans" },
      { slot: "bottom", slug: "trousers", name: "Trousers" },
      { slot: "shoes", slug: "white-sneakers", name: "White sneakers" },
      { slot: "shoes", slug: "loafers", name: "Loafers" },
    ],
  },
  men: {
    dir: "/samples/men",
    pieces: [
      { slot: "top", slug: "white-oxford", name: "White oxford" },
      { slot: "top", slug: "navy-sweater", name: "Navy sweater" },
      { slot: "bottom", slug: "dark-jeans", name: "Dark jeans" },
      { slot: "bottom", slug: "chinos", name: "Chinos" },
      { slot: "shoes", slug: "white-sneakers", name: "White sneakers" },
      { slot: "shoes", slug: "loafers", name: "Loafers" },
    ],
  },
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function FirstLookGame({
  shopGender,
  onDone,
}: {
  /** Decides which six pieces are offered. "all" and undefined fall back to women's. */
  shopGender?: "male" | "female" | "all";
  onDone: () => void;
}) {
  const set = SETS[shopGender === "male" ? "men" : "women"];
  const src = useCallback((slug: string) => `${set.dir}/${slug}-sticker.png`, [set.dir]);

  const [placed, setPlaced] = useState<Partial<Record<Slot, Piece>>>({});
  /** Distinct top+bottom pairs the user has assembled. Shoes are not part of the key. */
  const [found, setFound] = useState<Set<string>>(() => new Set());
  const [celebrate, setCelebrate] = useState(0);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Partial<Record<Slot, HTMLDivElement | null>>>({});
  const flyerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => flyerRef.current?.remove(), []);

  const totalLooks = useMemo(
    // Same helper the user's real first outfit uses, so the demo cannot over-promise.
    () => distinctLookCount(set.pieces.map((p) => ({ category: p.slot }))),
    [set.pieces],
  );

  /** The slot being asked for, or null once the board is full. */
  const need = ORDER.find((s) => !placed[s]) ?? null;
  const complete = need === null;

  /**
   * FLIP the tapped piece from its tray tile into its slot. Measured before and after, then
   * transformed from the old rect to the new one, on a clone in the viewport so it can cross both
   * containers' overflow without being clipped.
   */
  const fly = (from: HTMLElement, slot: Slot, url: string) =>
    new Promise<void>((resolve) => {
      const a = from.getBoundingClientRect();
      const b = slotRefs.current[slot]?.getBoundingClientRect();
      if (!b || prefersReducedMotion()) return resolve();

      const flyer = document.createElement("div");
      flyer.style.cssText = [
        "position:fixed",
        `left:${a.left}px`,
        `top:${a.top}px`,
        `width:${a.width}px`,
        `height:${a.height}px`,
        "z-index:80",
        "pointer-events:none",
        "will-change:transform,opacity",
        "display:flex",
        "align-items:center",
        "justify-content:center",
      ].join(";");
      const img = document.createElement("img");
      img.src = url;
      img.style.cssText = "max-width:100%;max-height:100%;object-fit:contain";
      flyer.appendChild(img);
      document.body.appendChild(flyer);
      flyerRef.current = flyer;

      const k = Math.min((b.width * 0.82) / a.width, (b.height * 0.82) / a.height);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);

      requestAnimationFrame(() => {
        // The iOS curve used elsewhere in the app — critically damped, no overshoot, because a
        // tap carries no momentum to justify bounce (apple-design §4).
        flyer.style.transition =
          "transform 420ms cubic-bezier(.32,.72,0,1), opacity 420ms ease";
        flyer.style.transform = `translate(${dx}px,${dy}px) scale(${k})`;
        flyer.style.opacity = "0.92";
      });

      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        flyer.remove();
        flyerRef.current = null;
        resolve();
      };
      flyer.addEventListener("transitionend", cleanup, { once: true });
      // Never strand the game on a dropped transitionend (backgrounded tab, etc).
      window.setTimeout(cleanup, 600);
    });

  async function place(piece: Piece, tile: HTMLElement) {
    // Re-tapping the piece already in that slot is a no-op; any other piece swaps it.
    if (placed[piece.slot]?.slug === piece.slug) return;
    await fly(tile, piece.slot, src(piece.slug));

    const nextPlaced = { ...placed, [piece.slot]: piece };
    setPlaced(nextPlaced);

    // Score only once the board is actually wearable.
    if (ORDER.every((s) => nextPlaced[s])) {
      const key = `${nextPlaced.top!.slug}|${nextPlaced.bottom!.slug}`;
      setFound((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      setCelebrate((c) => c + 1);
    }
  }

  /** Jump to a pair they have not assembled yet, so the nudge always shows something new. */
  function suggestAnother() {
    const tops = set.pieces.filter((p) => p.slot === "top");
    const bottoms = set.pieces.filter((p) => p.slot === "bottom");
    for (const t of tops) {
      for (const b of bottoms) {
        if (found.has(`${t.slug}|${b.slug}`)) continue;
        setPlaced((prev) => ({ ...prev, top: t, bottom: b }));
        setFound((prev) => {
          const next = new Set(prev);
          next.add(`${t.slug}|${b.slug}`);
          return next;
        });
        setCelebrate((c) => c + 1);
        return;
      }
    }
  }

  const n = found.size;
  const allFound = n >= totalLooks;

  const { kicker, title, hint } = headline(n, totalLooks, complete, set.pieces.length);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-muted">
          {kicker}
        </p>
        <h2 className="heading mt-2 text-2xl">{title}</h2>
        <p className="mt-2 text-[15px] leading-snug text-muted">{hint}</p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-3">
        <div
          ref={boardRef}
          className="relative aspect-[3/4] h-full max-w-full overflow-hidden rounded-2xl
            border border-line bg-white"
        >
          {/* The reward sweep lives on its own keyed overlay. Putting it on the board itself and
              keying THAT would remount every piece, replaying each one's landing pop on every
              new look. */}
          {celebrate > 0 && (
            <span
              key={celebrate}
              aria-hidden
              className="animate-board-win pointer-events-none absolute inset-0 z-10 rounded-2xl"
            />
          )}
          {ORDER.map((slot) => {
            const box = SLOT_BOX[slot];
            const piece = placed[slot];
            return (
              <div
                key={slot}
                ref={(el) => {
                  slotRefs.current[slot] = el;
                }}
                className="absolute flex aspect-square items-center justify-center"
                style={{ left: box.left, top: box.top, width: box.width }}
              >
                {!piece && (
                  <>
                    <span
                      className={`absolute inset-[8%] rounded-2xl border-[1.5px] border-dashed
                        ${need === slot ? "animate-pulse border-accent" : "border-line"}`}
                    />
                    <span className="relative text-[11px] uppercase tracking-[0.14em] text-muted">
                      {SLOT_LABEL[slot]}
                    </span>
                  </>
                )}
                {piece && (
                  <Image
                    key={piece.slug}
                    src={src(piece.slug)}
                    alt={piece.name}
                    width={240}
                    height={240}
                    unoptimized
                    className="animate-canvas-pop max-h-full max-w-full object-contain
                      [filter:drop-shadow(0_6px_10px_rgba(0,0,0,0.18))]"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-[30px] flex-none items-center gap-2.5">
        <span className="flex gap-1.5">
          {ORDER.map((slot) => (
            <span
              key={slot}
              className={`h-[7px] w-[7px] rounded-full transition-transform duration-200 ${
                placed[slot] ? "scale-125 bg-accent" : "bg-line"
              }`}
            />
          ))}
        </span>
        {complete && (
          <span
            className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent"
          >
            <b className="tabular-nums">{n}</b> of {totalLooks} looks found
          </span>
        )}
      </div>

      {/* A live tray, not a spent one: while filling, only the slot being asked for is bright;
          once the board is full every tile stays tappable, because swapping is the second half
          of the lesson. */}
      <div className="flex flex-none gap-[7px] pb-1 pt-0.5">
        {set.pieces.map((piece) => {
          const onBoard = placed[piece.slot]?.slug === piece.slug;
          const dimmed = Boolean(need) && piece.slot !== need;
          return (
            <button
              key={piece.slug}
              type="button"
              aria-label={piece.name}
              onPointerDown={(e) => void place(piece, e.currentTarget)}
              className={`flex aspect-square min-w-0 flex-1 items-center justify-center
                rounded-2xl border p-1.5 transition-[transform,opacity,border-color,background-color]
                duration-150 active:scale-95
                ${onBoard ? "border-accent bg-accent-soft" : "border-line bg-surface"}
                ${dimmed ? "opacity-40" : ""}`}
            >
              <Image
                src={src(piece.slug)}
                alt=""
                width={80}
                height={80}
                unoptimized
                className="max-h-full max-w-full object-contain"
              />
            </button>
          );
        })}
      </div>

      <div className="flex-none pb-6 pt-2">
        <Button className="w-full" onClick={onDone} disabled={!complete}>
          {complete ? "Now with my clothes" : "Make an outfit to continue"}
        </Button>
        {complete && !allFound && (
          <Button variant="ghost" className="mt-1 w-full" onClick={suggestAnother}>
            Try another
          </Button>
        )}
      </div>
    </div>
  );
}

/** Copy for each beat: first look, mid-collection, and all found. */
function headline(found: number, total: number, complete: boolean, pieces: number) {
  if (!complete) {
    return {
      kicker: "Try it",
      title: "Make an outfit",
      hint: "Tap a top, then a bottom, then shoes. These are our pieces — yours come next.",
    };
  }
  if (found <= 1) {
    return {
      kicker: "Nice",
      title: "That's a look.",
      hint: `Three taps, and that is the whole product. Now swap a piece — these six hold ${total} different outfits.`,
    };
  }
  if (found < total) {
    return {
      kicker: "Keep going",
      title: "Another one.",
      hint: `${total - found} more hiding in the same six pieces.`,
    };
  }
  return {
    kicker: `All ${total}`,
    title: `${pieces} pieces. ${total} outfits.`,
    hint: "That is why we ask for six photos and not sixty. Two tops and two bottoms did all of this.",
  };
}
