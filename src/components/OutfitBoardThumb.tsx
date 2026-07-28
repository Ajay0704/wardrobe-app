"use client";

import { useMemo, useState } from "react";
import type { CanvasItem, Outfit, WardrobeItem } from "@/lib/types";

/**
 * Renders a saved outfit board at any size (AJA-239). Outfits already store the exact board
 * recipe (`layout` + `canvasBg`) the user composed, but the library used to throw it away and
 * draw a 2×2 collage capped at 4 items — so a 6-piece look showed 4, in positions the user
 * never chose. This renders the real thing: every piece at its saved x/y/size/rotation/z-order,
 * scaled into whatever box it's given.
 *
 * Layout coordinates are board pixels, so we normalise against the layout's own bounding box
 * and position everything in %, making the board resolution-independent.
 *
 * Outfits saved before boards existed (samples, stylist saves) have no `layout` — those fall
 * back to a simple centred stack so nothing renders empty.
 */
export function OutfitBoardThumb({
  outfit,
  items,
  className = "",
}: {
  outfit: Outfit;
  items: WardrobeItem[];
  className?: string;
}) {
  const placed = useMemo(() => placePieces(outfit, items), [outfit, items]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={outfit.canvasBg ? { background: outfit.canvasBg } : undefined}
    >
      {placed.map((p) => (
        <Piece key={p.key} piece={p} />
      ))}
    </div>
  );
}

interface Placed {
  key: string;
  /** All in % of the board box. */
  left: number;
  top: number;
  width: number;
  rotation: number;
  flipped: boolean;
  zIndex: number;
  item?: WardrobeItem;
  text?: string;
  color?: string;
  emoji?: string;
}

function placePieces(outfit: Outfit, items: WardrobeItem[]): Placed[] {
  const byId = (id?: string) => items.find((it) => it.id === id);
  const layout = outfit.layout?.filter(
    (c) => c.kind !== "item" || !!byId(c.itemId),
  );

  if (layout && layout.length) {
    const box = bounds(layout);
    const w = box.maxX - box.minX || 1;
    const h = box.maxY - box.minY || 1;
    // Fit the composition into the box with a little breathing room.
    const pad = 6;
    const span = 100 - pad * 2;
    return layout.map((c, i) => ({
      key: c.id || `${i}`,
      left: pad + ((c.x - box.minX) / w) * span,
      top: pad + ((c.y - box.minY) / h) * span,
      width: (c.width / w) * span,
      rotation: c.rotation || 0,
      flipped: !!c.flipped,
      zIndex: c.zIndex ?? i,
      item: c.kind === "item" ? byId(c.itemId) : undefined,
      text: c.kind === "text" ? c.text : undefined,
      color: c.color,
      emoji: c.kind === "sticker" ? c.emoji : undefined,
    }));
  }

  // No saved board (legacy / stylist / sample looks) — centred stack, largest first.
  const resolved = outfit.itemIds
    .map(byId)
    .filter((it): it is WardrobeItem => !!it)
    .slice(0, 5);
  const n = resolved.length;
  if (!n) return [];
  const width = n === 1 ? 66 : 56;
  const step = n > 1 ? Math.min(26, (88 - width * 0.9) / (n - 1)) : 0;
  return resolved.map((item, i) => ({
    key: item.id,
    left: 50 - width / 2 + (i % 2 === 0 ? -4 : 4),
    top: n === 1 ? 18 : 6 + i * step,
    width,
    rotation: 0,
    flipped: false,
    zIndex: i,
    item,
  }));
}

function bounds(layout: CanvasItem[]) {
  return layout.reduce(
    (acc, c) => ({
      minX: Math.min(acc.minX, c.x),
      minY: Math.min(acc.minY, c.y),
      maxX: Math.max(acc.maxX, c.x + c.width),
      maxY: Math.max(acc.maxY, c.y + c.height),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function Piece({ piece: p }: { piece: Placed }) {
  const [err, setErr] = useState(false);
  const style: React.CSSProperties = {
    left: `${p.left}%`,
    top: `${p.top}%`,
    width: `${p.width}%`,
    zIndex: p.zIndex,
    transform: `rotate(${p.rotation}deg)${p.flipped ? " scaleX(-1)" : ""}`,
    transformOrigin: "center center",
  };

  if (p.text) {
    return (
      <span
        className="absolute whitespace-pre-wrap font-medium leading-tight"
        style={{ ...style, color: p.color, fontSize: `${Math.max(6, p.width * 0.22)}%` }}
      >
        {p.text}
      </span>
    );
  }
  if (p.emoji) {
    return (
      <span className="absolute leading-none" style={{ ...style, fontSize: `${p.width}%` }}>
        {p.emoji}
      </span>
    );
  }
  if (!p.item) return null;
  if (err || !p.item.imageUrl) {
    return (
      <span
        className="absolute aspect-square rounded-lg"
        style={{ ...style, background: p.item.color }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p.item.imageUrl}
      alt={p.item.name}
      onError={() => setErr(true)}
      className="absolute object-contain"
      style={{ ...style, maxHeight: "88%" }}
    />
  );
}
