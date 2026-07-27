"use client";

import { useGesture } from "@use-gesture/react";
import { useRef } from "react";
import type { CanvasItem } from "@/lib/types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Props {
  c: CanvasItem;
  board: { w: number; h: number };
  selected: boolean;
  children: React.ReactNode;
  onSelect: (id: string) => void;
  onLongPress: (id: string) => void;
  onCommit: (id: string, patch: Partial<CanvasItem>) => void;
  onRemove: (id: string) => void;
  trashRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * One draggable / pinchable / rotatable cutout on the outfit board (AJA-232). Pinterest-style:
 * no bounding box, one-finger drag, two-finger pinch to scale + rotate, long-press for the control
 * menu, and drag onto the trash to delete. Gestures drive a live GPU transform imperatively for
 * 60fps; committed state (x/y/width/height/rotation) is written to the store ONLY on gesture end
 * (so pinch scale bakes into width/height — no new model field, and no re-render mid-gesture).
 * The trash drop-zone is toggled imperatively via `trashRef` for the same reason.
 */
export function CanvasPiece({
  c,
  board,
  selected,
  children,
  onSelect,
  onLongPress,
  onCommit,
  onRemove,
  trashRef,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const live = useRef({ dx: 0, dy: 0, scale: 1, rot: c.rotation });
  const lp = useRef<number | null>(null);

  const applyLive = () => {
    const el = elRef.current;
    if (!el) return;
    const { dx, dy, scale, rot } = live.current;
    el.style.transform = `translate3d(${c.x + dx}px,${c.y + dy}px,0) rotate(${rot}deg) scale(${scale})`;
  };
  const clearLp = () => {
    if (lp.current) {
      clearTimeout(lp.current);
      lp.current = null;
    }
  };
  const overTrash = (x: number, y: number) => {
    const t = trashRef.current?.getBoundingClientRect();
    return !!t && x >= t.left - 16 && x <= t.right + 16 && y >= t.top - 16 && y <= t.bottom + 16;
  };
  const trashUI = (show: boolean, hot: boolean) => {
    const t = trashRef.current;
    if (!t) return;
    t.style.opacity = show ? "1" : "0";
    t.style.transform = `translateX(-50%) translateY(${show ? 0 : 20}px) scale(${hot ? 1.14 : 1})`;
    t.style.background = hot ? "rgba(239,68,68,0.26)" : "rgba(239,68,68,0.10)";
    t.style.borderColor = hot ? "#ef4444" : "rgba(248,113,113,0.6)";
  };

  const bind = useGesture(
    {
      onDragStart: () => {
        onSelect(c.id);
        live.current = { dx: 0, dy: 0, scale: 1, rot: c.rotation };
        clearLp();
        lp.current = window.setTimeout(() => onLongPress(c.id), 460);
      },
      onDrag: ({ movement: [mx, my], pinching, tap, last, xy: [px, py] }) => {
        if (pinching) return; // two fingers → onPinch owns it
        if (Math.hypot(mx, my) > 5) clearLp();
        live.current.dx = mx;
        live.current.dy = my;
        applyLive();
        const hot = overTrash(px, py);
        if (!tap) trashUI(true, hot);
        if (last) {
          clearLp();
          trashUI(false, false);
          if (!tap && hot) {
            onRemove(c.id);
            return;
          }
          live.current.dx = 0;
          live.current.dy = 0;
          if (!tap) {
            const nx = clamp(c.x + mx, -c.width * 0.4, board.w - c.width * 0.6);
            const ny = clamp(c.y + my, -c.height * 0.4, board.h - c.height * 0.6);
            onCommit(c.id, { x: Math.round(nx), y: Math.round(ny) });
          }
        }
      },
      onPinch: ({ offset: [s, a], first, last }) => {
        if (first) {
          onSelect(c.id);
          clearLp();
        }
        live.current.scale = s;
        live.current.rot = a;
        applyLive();
        if (last) {
          const nw = clamp(Math.round(c.width * s), 40, Math.round(board.w * 1.6));
          const nh = clamp(Math.round(c.height * s), 40, Math.round(board.h * 1.6));
          const nx = Math.round(c.x + (c.width - nw) / 2); // keep centre fixed
          const ny = Math.round(c.y + (c.height - nh) / 2);
          live.current = { dx: 0, dy: 0, scale: 1, rot: a };
          onCommit(c.id, { width: nw, height: nh, rotation: Math.round(a), x: nx, y: ny });
        }
      },
    },
    {
      drag: { filterTaps: true, pointer: { touch: true } },
      pinch: { from: () => [1, c.rotation], rubberband: true, pointer: { touch: true } },
    },
  );

  return (
    <div
      ref={elRef}
      {...bind()}
      className="absolute left-0 top-0 select-none"
      style={{
        width: c.width,
        height: c.height,
        zIndex: c.zIndex,
        transform: `translate3d(${c.x}px,${c.y}px,0) rotate(${c.rotation}deg)`,
        transformOrigin: "center center",
        touchAction: "none",
        cursor: "grab",
      }}
    >
      <div
        className="animate-canvas-pop h-full w-full"
        style={{
          filter: selected
            ? "drop-shadow(0 14px 24px rgba(0,0,0,0.30))"
            : "drop-shadow(0 6px 10px rgba(0,0,0,0.18))",
          transition: "filter 0.15s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
