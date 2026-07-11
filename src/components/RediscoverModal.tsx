"use client";

import { Check, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { styleWays } from "@/lib/rediscover";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { Button, MatchBadge, Modal } from "./ui";

/**
 * "N ways to style this" — surfaces complete outfits built from the rest of the
 * closet around an anchor item, each saveable as an outfit or loggable as worn.
 */
export function RediscoverModal({
  anchor,
  onClose,
}: {
  anchor: WardrobeItem;
  onClose: () => void;
}) {
  const items = useWardrobe((s) => s.items);
  const saveOutfit = useWardrobe((s) => s.saveOutfit);
  const logWear = useWardrobe((s) => s.logWear);
  const [seed, setSeed] = useState(0);
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [worn, setWorn] = useState<Record<number, boolean>>({});

  // seed is a dependency so "Shuffle" regenerates a fresh set of ideas.
  const ideas = useMemo(
    () => styleWays(anchor, items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, items, seed],
  );

  return (
    <Modal title={`Ways to style ${anchor.name}`} onClose={onClose} wide>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-sm text-muted">
          <Sparkles size={14} className="text-accent" /> Built from pieces you
          already own.
        </p>
        {ideas.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSeed((s) => s + 1);
              setSaved({});
              setWorn({});
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <RefreshCw size={14} /> Shuffle
          </button>
        )}
      </div>

      {ideas.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface-2 px-4 py-10 text-center text-sm text-muted">
          Not enough pieces to build a full look yet. Add a bottom and some shoes
          (or a dress) and try again.
        </div>
      ) : (
        <div className="space-y-4">
          {ideas.map((idea, i) => (
            <div key={i} className="rounded-2xl border border-line p-3">
              <div className="flex items-center justify-between gap-2 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Look {i + 1}
                </span>
                <MatchBadge score={idea.score} />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {idea.items.map((it) => (
                  <div
                    key={it.id}
                    className={`relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border bg-surface-2 ${
                      it.id === anchor.id
                        ? "border-accent ring-1 ring-accent"
                        : "border-line"
                    }`}
                    title={it.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.imageUrl}
                      alt={it.name}
                      className="h-full w-full object-cover"
                    />
                    {it.id === anchor.id && (
                      <span className="absolute inset-x-0 bottom-0 bg-accent/90 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-white">
                        This piece
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <p className="pt-2 text-sm text-muted">{idea.reason}</p>

              <div className="flex justify-end gap-2 pt-2.5">
                <Button
                  variant="outline"
                  disabled={worn[i]}
                  onClick={() => {
                    logWear({ itemIds: idea.itemIds });
                    setWorn((w) => ({ ...w, [i]: true }));
                  }}
                >
                  <Check size={14} /> {worn[i] ? "Logged" : "I'd wear this"}
                </Button>
                <Button
                  disabled={saved[i]}
                  onClick={() => {
                    saveOutfit(`${anchor.name} · Look ${i + 1}`, "", idea.itemIds);
                    setSaved((s) => ({ ...s, [i]: true }));
                  }}
                >
                  {saved[i] ? "Saved ✓" : "Save as outfit"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
