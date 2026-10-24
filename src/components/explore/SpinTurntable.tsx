"use client";

/**
 * AJA-305 — the 360° spin turntable: drag to turn, flick to coast, arrow keys, four angle
 * tiles. Presentation only; `useSpin` owns making and loading.
 *
 * Lifted from the prototype (src/components/proto/TryOn360Preview.tsx), where the feel was
 * tuned with Ajay:
 *  - Drawn IMPERATIVELY on a canvas, never by swapping <img> src (Safari can flash a blank
 *    frame mid-drag).
 *  - Drag direction is negative: as the angle grows the body faces further to the viewer's
 *    left, so dragging left has to grow it — the body follows the finger.
 *  - No settling after a coast: every frame is a real picture, so wherever it stops is a
 *    finished view. (The photo turntable it replaced had to snap; this doesn't.)
 */

import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { frameForAngle } from "@/lib/spin-pacing";
import type { SpinFrames } from "@/lib/spin-frames";

const DRAG_DEG_PER_PX = -0.6;
/** Coast distance ≈ vel·16/(1−FRICTION): the hardest flick goes about half a turn. */
const FRICTION = 0.92;
const STOP_BELOW = 0.01;
const MAX_VEL = 0.9;
/** A finger held still this long before lifting is a release, not a flick. */
const STILL_MS = 60;

const norm = (deg: number) => ((deg % 360) + 360) % 360;
const SECTORS = ["Front", "¾", "Side", "¾ back", "Back", "¾ back", "Side", "¾"];
const sectorName = (deg: number) => SECTORS[Math.round(norm(deg) / 45) % 8];
const TILES = [
  { label: "Front", deg: 0 },
  { label: "¾", deg: 45 },
  { label: "Side", deg: 90 },
  { label: "Back", deg: 180 },
];
function tileFor(deg: number): number {
  const d = norm(deg);
  const off = Math.min(d, 360 - d);
  return off < 22.5 ? 0 : off < 67.5 ? 1 : off < 112.5 ? 2 : 3;
}
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function SpinTurntable({ frames }: { frames: SpinFrames }) {
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [turned, setTurned] = useState(false);
  const angleRef = useRef(0);
  const drag = useRef<{ x: number; at: number; vel: number } | null>(null);
  const raf = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const draw = useCallback(
    (deg: number) => {
      const c = canvasRef.current;
      const img = frames.images[frameForAngle(frames.angles, deg)];
      if (!c || !img?.naturalWidth) return;
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    },
    [frames],
  );
  const setBoth = useCallback(
    (deg: number) => {
      angleRef.current = deg;
      draw(deg);
      setAngle(deg);
    },
    [draw],
  );
  const attachCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      if (el) draw(angleRef.current);
    },
    [draw],
  );

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const animateTo = useCallback(
    (deg: number) => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      const target = angleRef.current + (((deg - norm(angleRef.current) + 540) % 360) - 180);
      if (prefersReducedMotion()) {
        setBoth(target);
        return;
      }
      const step = () => {
        const next = angleRef.current + (target - angleRef.current) * 0.18;
        if (Math.abs(target - next) < 0.2) {
          setBoth(target);
          raf.current = null;
          return;
        }
        setBoth(next);
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [setBoth],
  );

  const coast = useCallback(
    (startVel: number) => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (prefersReducedMotion() || Math.abs(startVel) < STOP_BELOW) return;
      let vel = Math.max(-MAX_VEL, Math.min(MAX_VEL, startVel));
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(48, now - last);
        last = now;
        setBoth(angleRef.current + vel * dt);
        vel *= Math.pow(FRICTION, dt / 16);
        raf.current = Math.abs(vel) < STOP_BELOW ? null : requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [setBoth],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    drag.current = { x: e.clientX, at: performance.now(), vel: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dx = e.clientX - d.x;
    const dDeg = dx * DRAG_DEG_PER_PX;
    d.vel = d.vel * 0.3 + (dDeg / Math.max(1, now - d.at)) * 0.7;
    d.x = e.clientX;
    d.at = now;
    setBoth(angleRef.current + dDeg);
    if (!turned && dx !== 0) setTurned(true);
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    coast(performance.now() - d.at > STILL_MS ? 0 : d.vel);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    animateTo(norm(angleRef.current) + (e.key === "ArrowRight" ? 15 : -15));
  };

  const name = sectorName(angle);
  const lit = tileFor(angle);

  return (
    <>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Turn the look"
        aria-valuetext={name}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(norm(angle))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={`relative mx-auto aspect-[3/4] w-full max-w-xs select-none overflow-hidden rounded-2xl border border-line bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{ touchAction: "pan-y" }}
      >
        <canvas
          ref={attachCanvas}
          width={480}
          height={640}
          aria-hidden
          className="animate-tryon-reveal absolute inset-0 h-full w-full"
        />
        <div className="absolute left-2.5 top-2.5 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur">
          {name}
        </div>
        {!turned && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="animate-fade-up rounded-full bg-background/80 px-3 py-1 text-[11px] font-medium text-foreground backdrop-blur">
              Drag to turn
            </span>
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-xs grid-cols-4 gap-2">
        {TILES.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => animateTo(t.deg)}
            aria-label={`${t.label} view`}
            className="group flex flex-col items-center gap-1"
          >
            <span
              className={`relative block aspect-[3/4] w-full overflow-hidden rounded-xl border bg-surface-2 transition-[border-color,transform] duration-150 group-active:scale-[0.97] ${
                lit === i ? "border-accent" : "border-line"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frames.images[frameForAngle(frames.angles, t.deg)]?.src}
                alt=""
                className="animate-tryon-reveal h-full w-full object-cover object-top"
              />
            </span>
            <span className={`text-[11px] ${lit === i ? "font-medium text-foreground" : "text-muted"}`}>
              {t.label}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
