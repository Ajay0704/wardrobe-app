"use client";

import { forwardRef } from "react";
import { scoreOutfit } from "@/lib/color";
import type { WardrobeItem } from "@/lib/types";
import { MatchBadge } from "./ui";

/**
 * Layered outfit preview — items are stacked in a fashion-flat-lay style.
 * The ref is forwarded so the builder can export this node as a PNG.
 */
export const OutfitPreview = forwardRef<
  HTMLDivElement,
  {
    items: WardrobeItem[];
    compact?: boolean;
    showScore?: boolean;
  }
>(function OutfitPreview({ items, compact, showScore = true }, ref) {
  const score = items.length >= 2 ? scoreOutfit(items.map((it) => it.color)) : null;

  if (items.length === 0) {
    return (
      <div
        ref={ref}
        className={`flex items-center justify-center rounded-3xl border border-dashed border-line bg-surface-2/50 text-center ${
          compact ? "aspect-[3/4] p-4" : "min-h-[320px] p-8"
        }`}
      >
        <p className="text-sm text-muted">
          Add pieces to see your outfit come together
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {showScore && score !== null && (
        <div className="absolute right-3 top-3 z-10">
          <MatchBadge score={score} />
        </div>
      )}
      <div
        ref={ref}
        className={`relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-surface-2/80 to-surface ${
          compact ? "aspect-[3/4]" : "min-h-[320px]"
        }`}
      >
        {/* Soft backdrop tint from the dominant color */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(circle at 50% 30%, ${items[0]?.color}44, transparent 70%)`,
          }}
        />

        <div className="relative flex h-full flex-col items-center justify-center gap-1 p-4">
          {items.map((item, i) => (
            <div
              key={item.id}
              className="relative transition-transform"
              style={{
                width: compact ? "55%" : "45%",
                marginTop: i === 0 ? 0 : compact ? -28 : -36,
                zIndex: i + 1,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full rounded-xl object-cover shadow-lg shadow-black/10"
                style={{ aspectRatio: "3/4" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
