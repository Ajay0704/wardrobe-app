"use client";

/**
 * AJA-305 — the 360° half of "See it on you". Before the spin exists the canvas shows the
 * front render it will start from; dragging it gives way with resistance and springs back,
 * so it reads as "not yet" rather than a frozen screen (the prototype's first complaint).
 */

import { Check, Loader2, Rotate3d, User } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { SpinTurntable } from "./SpinTurntable";
import type { useSpin } from "./useSpin";

export function Spin360Panel({
  spin,
  frontSrc,
}: {
  spin: ReturnType<typeof useSpin>;
  frontSrc: string | null;
}) {
  const [nudge, setNudge] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [triedEarly, setTriedEarly] = useState(false);
  const startX = useRef<{ id: number; x: number } | null>(null);
  const busy = spin.status === "making" || spin.status === "loading";

  if (spin.status === "ready" && spin.frames) {
    return (
      <>
        <SpinTurntable frames={spin.frames} />
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted">
          <Check size={15} /> Saved to this look
        </p>
        {/* A failed "Make a new spin" leaves the good spin up; the route's message goes here. */}
        {spin.error && <p className="text-center text-xs text-muted">{spin.error}</p>}
        <button type="button" onClick={spin.make} className="mx-auto block text-xs text-muted active:scale-95">
          Make a new spin
        </button>
      </>
    );
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    // AJA-305 — one pointer owns the nudge; a second finger or right-click is ignored.
    if (startX.current || !e.isPrimary || e.button !== 0) return;
    startX.current = { id: e.pointerId, x: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!startX.current || e.pointerId !== startX.current.id) return;
    const total = e.clientX - startX.current.x;
    setNudge(Math.sign(total) * 28 * (1 - Math.exp(-Math.abs(total) / 120)));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!startX.current || e.pointerId !== startX.current.id) return;
    startX.current = null;
    setDragging(false);
    if (Math.abs(nudge) > 4) setTriedEarly(true);
    setNudge(0);
  };

  const pct = Math.round(spin.progress * 99);

  return (
    <>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative mx-auto aspect-[3/4] w-full max-w-xs select-none overflow-hidden rounded-2xl border border-line bg-surface-2"
        style={{ touchAction: "pan-y" }}
      >
        <div
          className={`absolute inset-0 ${dragging ? "" : "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"}`}
          style={{ transform: `translateX(${nudge}px)` }}
        >
          {frontSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frontSrc} alt="Try-on result" draggable={false} className="h-full w-full object-contain" />
          )}
        </div>
        {!busy && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2.5 pt-10 text-center">
            <p className="text-[11px] font-medium text-white">
              {spin.error ??
                (spin.hasSpin
                  ? "Couldn't load the spin — try again"
                  : triedEarly
                    ? "Tap Make it 360° first — then drag to turn"
                    : "Front only — make the spin to turn it")}
            </p>
          </div>
        )}
        {busy && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-background/85 px-3 py-2 backdrop-blur">
            <p aria-live="polite" className="text-center text-[12px] font-medium text-foreground">
              {spin.status === "making" ? "Filming the turn" : "Loading the spin"}
            </p>
            <div className="mx-auto mt-2 h-px w-24 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-accent transition-[width] duration-100 ease-linear" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-xs grid-cols-4 gap-2" aria-hidden>
        {["Front", "¾", "Side", "Back"].map((label) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className="relative block aspect-[3/4] w-full rounded-xl border border-line bg-surface-2">
              <span className="absolute inset-0 flex items-center justify-center text-muted/60">
                {busy ? <Loader2 size={15} className="animate-spin text-accent" /> : <User size={15} />}
              </span>
            </span>
            <span className="text-[11px] text-muted">{label}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={spin.make}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Making your spin…
            </>
          ) : (
            <>
              <Rotate3d size={15} /> {spin.hasSpin ? "Make a new spin" : "Make it 360°"}
            </>
          )}
        </button>
        <p className="text-center text-[11px] text-muted">One 6-second spin of this look — about 30 seconds.</p>
        {/* A saved spin that failed to LOAD is retried for free; only the main button pays. */}
        {spin.hasSpin && spin.status === "error" && (
          <button type="button" onClick={spin.open} className="mx-auto block text-xs text-muted active:scale-95">
            Try loading it again
          </button>
        )}
      </div>
    </>
  );
}
