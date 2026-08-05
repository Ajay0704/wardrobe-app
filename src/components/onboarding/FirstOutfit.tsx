"use client";

/**
 * The first outfit — the payoff at the end of First Six (AJA-277).
 *
 * This is the whole point of the flow. Before it, a new user finished onboarding and was handed
 * a closet; now they are handed something to wear, made of their own clothes, in six taps.
 *
 * LAYOUT IS THE EXISTING "SURPRISE ME" BOARD, not a new design. The geometry below mirrors
 * `CanvasBuilderView.placeLook` (AJA-232): a 3:4 white board, hero top + bottom in the LEFT
 * column, supports on the RIGHT with shoes low. Percentages are of board width/height and each
 * piece box is square with the image contained, exactly as a `CanvasItem` is placed. The bottom
 * intentionally sits flush to the left edge — `placeLook` computes `leftCx - HERO*1.12/2`, which
 * goes slightly negative and clamps to 0. Keep the two in step: `placeLook` is the source of
 * truth, this is a read-only mirror of it.
 *
 * WHAT THE COUNT MEANS. "Four outfits from six pieces" is tops x bottoms — NOT x shoes.
 * Multiplying by footwear would let six pieces claim eight outfits, which is technically true
 * and reads as inflation; swapping shoes is a variation on a look, not another look. The whole
 * screen depends on not overstating a number the user can check by eye.
 *
 * HONESTY ABOUT COVERAGE. Guided six-piece capture produces a wearable look 94% of the time in
 * warm weather but only ~52% in cold, where an outfit wants outerwear. So this screen OFFERS
 * and never promises: when the engine returns nothing it says so plainly and points at the one
 * thing that would fix it, rather than showing an empty board.
 */

import Image from "next/image";
import { useMemo, useState } from "react";
import { bestLook, suggestLooks } from "@/lib/matching";
import { useWardrobe } from "@/lib/store";
import type { ScoredLook } from "@/lib/matching";
import type { WardrobeItem } from "@/lib/types";
import { Button } from "../ui";

/** Board placement, mirroring placeLook. Values are % of board width (w) / height (h). */
const SLOT_BOX: Record<string, { left: string; top: string; width: string }> = {
  // LEFT column — hero. leftX 3%, both centred on leftCx so top and bottom line up.
  top: { left: "3%", top: "6%", width: "52%" },
  dress: { left: "3%", top: "14%", width: "52%" },
  // HERO * 1.12: pants read narrow, so they get a bigger box to feel proportionate.
  bottom: { left: "0", top: "50%", width: "58.24%" },
  // RIGHT column — supports, centred on rCx 74%.
  outerwear: { left: "54%", top: "6%", width: "40%" },
  shoes: { left: "56%", top: "70%", width: "36%" },
};

const ORDER = ["outerwear", "dress", "top", "bottom", "shoes"] as const;

export default function FirstOutfit({
  onAccept,
  onAddMore,
  onSkip,
}: {
  /** The look landed — carry on. */
  onAccept: () => void;
  /** No look was possible. Go back and capture the piece that unblocks it. */
  onAddMore: () => void;
  /** Leave it for later without capturing more. */
  onSkip: () => void;
}) {
  const items = useWardrobe((s) => s.items);
  const [roll, setRoll] = useState(0);

  const owned = useMemo(() => items.filter((i) => !i.wishlist && i.imageUrl), [items]);

  /**
   * A slate of three rather than one look, so "Show me another" is a genuine alternative
   * (diversified by garment TYPE inside the engine) instead of a reshuffle of the same pieces.
   */
  const slate = useMemo<ScoredLook[]>(() => {
    if (owned.length < 2) return [];
    const looks = suggestLooks(owned, { count: 3, candidates: 40 });
    if (looks.length) return looks;
    const one = bestLook(owned);
    return one ? [one] : [];
  }, [owned]);

  const look = slate.length ? slate[roll % slate.length] : null;

  const counts = useMemo(() => {
    const by = (c: string) => owned.filter((i) => i.category === c).length;
    // Dresses are a complete look on their own, so they add rather than multiply.
    const combos = by("top") * by("bottom") + by("dress");
    return { combos: Math.max(combos, look ? 1 : 0), pieces: owned.length };
  }, [owned, look]);

  const placed = useMemo(() => {
    if (!look) return [] as { item: WardrobeItem; box: (typeof SLOT_BOX)[string] }[];
    const out: { item: WardrobeItem; box: (typeof SLOT_BOX)[string] }[] = [];
    for (const slot of ORDER) {
      const it = look.items.find((i) => i.category === slot);
      if (it && SLOT_BOX[slot]) out.push({ item: it, box: SLOT_BOX[slot] });
    }
    return out;
  }, [look]);

  const names = placed.map((p) => p.item.name).filter(Boolean);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-muted">Today</p>
        <h2 className="heading mt-2 text-2xl">
          {look ? (roll === 0 ? "Wear this." : "Or this.") : "Nearly there."}
        </h2>
      </div>

      {look ? (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center py-3">
            <div
              className="relative aspect-[3/4] h-full max-w-full overflow-hidden rounded-2xl
                border border-line bg-white"
            >
              {placed.map(({ item, box }, i) => (
                <div
                  key={item.id}
                  className="animate-canvas-pop absolute flex aspect-square items-center
                    justify-center"
                  style={{
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    // Staggered so the look assembles piece by piece rather than blinking in
                    // whole — the same landing motion the canvas uses when a piece is placed.
                    animationDelay: `${i * 70}ms`,
                  }}
                >
                  <Image
                    src={item.imageUrl!}
                    alt={item.name || item.category}
                    width={240}
                    height={240}
                    unoptimized
                    className="max-h-full max-w-full object-contain
                      [filter:drop-shadow(0_6px_10px_rgba(0,0,0,0.18))]"
                  />
                </div>
              ))}
            </div>
          </div>

          {names.length > 0 && (
            <p className="flex-none pb-2 text-[12.5px] leading-snug text-muted">
              {names.join(" · ")}
            </p>
          )}

          <div className="flex flex-none items-center gap-2 pb-1">
            <span className="h-[7px] w-[7px] rounded-full bg-accent" />
            <p className="text-[15px] font-semibold">
              {counts.combos === 1
                ? "One outfit"
                : `${counts.combos} outfits`}{" "}
              from {counts.pieces} {counts.pieces === 1 ? "piece" : "pieces"}
            </p>
          </div>
        </>
      ) : (
        /* No look. Say which slot is missing rather than showing an empty board — a silent
           screen is what makes people conclude the app doesn't work. */
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <p className="text-[15px] leading-relaxed text-muted">
            {missingSlotMessage(owned)}
          </p>
        </div>
      )}

      <div className="flex-none pb-6 pt-3">
        <Button className="w-full" onClick={look ? onAccept : onAddMore}>
          {look ? "Looks right" : "Add it now"}
        </Button>
        {look && slate.length > 1 && (
          <Button variant="ghost" className="mt-1 w-full" onClick={() => setRoll((r) => r + 1)}>
            Show me another
          </Button>
        )}
        {!look && (
          <Button variant="ghost" className="mt-1 w-full" onClick={onSkip}>
            Later
          </Button>
        )}
      </div>
    </div>
  );
}

/** Name the one thing that unblocks a look. Shoes first: they cause 29.9% of all failures. */
function missingSlotMessage(owned: WardrobeItem[]): string {
  const has = (c: string) => owned.some((i) => i.category === c);
  if (!has("shoes")) return "Add one pair of shoes and we can put a full outfit together.";
  if (!has("bottom") && !has("dress")) return "Add jeans or trousers and we can dress you.";
  if (!has("top") && !has("dress")) return "Add a top and we can dress you.";
  return "Add one more piece and we can put a full outfit together.";
}
