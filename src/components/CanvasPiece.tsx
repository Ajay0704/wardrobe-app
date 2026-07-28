"use client";

import { useGesture } from "@use-gesture/react";
import { useRef } from "react";
import type { CanvasItem } from "@/lib/types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Props {
  c: CanvasItem;
  board: { w: number; h: number };
  /** The board's current CSS scale — screen deltas are divided by this to get board-local coords. */
  scale: number;
  selected: boolean;
  children: React.ReactNode;
  onSelect: (id: string) => void;
  onCommit: (id: string, patch: Partial<CanvasItem>) => void;
  onRemove: (id: string) => void;
  trashRef: React.RefObject<HTMLDivElement | null>;
  /** Shared sessions use these to broadcast who is holding what (AJA-240). */
  onGrab?: (id: string) => void;
  onRelease?: (id: string) => void;
}

/**
 * One draggable / pinchable / rotatable cutout on the outfit board (AJA-232). Pinterest-style: no
 * bounding box, one-finger drag, two-finger pinch to scale + rotate, drag onto the trash to delete.
 * Gestures drive a live GPU transform imperatively for 60fps; committed state (x/y/width/height/
 * rotation) is written to the store only on gesture end (pinch scale bakes into width/height — no
 * model field). The piece lives INSIDE the CSS-scaled board, so screen deltas are divided by
 * `scale` to stay in board coordinates. Selection (tap) surfaces the fixed control strip in the
 * parent (no more popup above the item); the trash zone is toggled imperatively via `trashRef`.
 */
export function CanvasPiece({
  c,
  board,
  scale,
  selected,
  children,
  onSelect,
  onCommit,
  onRemove,
  trashRef,
  onGrab,
  onRelease,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const live = useRef({ dx: 0, dy: 0, scale: 1, rot: c.rotation });
  // The piece's committed geometry, frozen when the gesture starts (AJA-240). This
  // used to read `c` live, which is fine solo but breaks in a shared session: a
  // collaborator's patch landing mid-drag rebased the transform, and the end-of-
  // gesture commit then added the full finger movement to the NEW origin, so the
  // piece jumped. Freezing means a remote change is simply ignored until you let go.
  const base = useRef({ x: c.x, y: c.y, width: c.width, height: c.height });
  const freeze = () => {
    base.current = { x: c.x, y: c.y, width: c.width, height: c.height };
  };

  const applyLive = () => {
    const el = elRef.current;
    if (!el) return;
    const { dx, dy, scale: s, rot } = live.current;
    const { x, y } = base.current;
    el.style.transform = `translate3d(${x + dx}px,${y + dy}px,0) rotate(${rot}deg) scale(${s})`;
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
  const s = () => (scale > 0 ? scale : 1); // divide screen deltas by the board scale

  const bind = useGesture(
    {
      onDragStart: () => {
        onSelect(c.id);
        freeze();
        onGrab?.(c.id);
        live.current = { dx: 0, dy: 0, scale: 1, rot: c.rotation };
      },
      onDrag: ({ movement: [mx, my], pinching, tap, last, xy: [px, py] }) => {
        if (pinching) return; // two fingers → onPinch owns it
        live.current.dx = mx / s();
        live.current.dy = my / s();
        applyLive();
        const hot = overTrash(px, py);
        if (!tap) trashUI(true, hot);
        if (last) {
          trashUI(false, false);
          onRelease?.(c.id);
          if (!tap && hot) {
            onRemove(c.id);
            return;
          }
          live.current.dx = 0;
          live.current.dy = 0;
          if (!tap) {
            const b = base.current;
            const nx = clamp(b.x + mx / s(), -b.width * 0.4, board.w - b.width * 0.6);
            const ny = clamp(b.y + my / s(), -b.height * 0.4, board.h - b.height * 0.6);
            onCommit(c.id, { x: Math.round(nx), y: Math.round(ny) });
          }
        }
      },
      onPinch: ({ offset: [sc, a], first }) => {
        if (first) {
          onSelect(c.id);
          freeze();
          onGrab?.(c.id);
        }
        live.current.scale = sc;
        live.current.rot = a;
        applyLive();
      },
      onPinchEnd: ({ offset: [sc, a] }) => {
        const b = base.current;
        const nw = clamp(Math.round(b.width * sc), 40, Math.round(board.w * 1.6));
        const nh = clamp(Math.round(b.height * sc), 40, Math.round(board.h * 1.6));
        const nx = Math.round(b.x + (b.width - nw) / 2); // keep centre fixed
        const ny = Math.round(b.y + (b.height - nh) / 2);
        live.current = { dx: 0, dy: 0, scale: 1, rot: a };
        onRelease?.(c.id);
        onCommit(c.id, { width: nw, height: nh, rotation: Math.round(a), x: nx, y: ny });
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
