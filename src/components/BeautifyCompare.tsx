"use client";

import { X } from "lucide-react";

/**
 * Before/after confirm for a Beautify redraw (AJA-209). Beautify is generative
 * and can drift (e.g. redraw a grey sweater as a white tee), so we never swap
 * the photo silently — the user compares their photo with the product shot and
 * picks one. Rendered full-screen above the item editor.
 */
export function BeautifyCompare({
  before,
  after,
  onKeep,
  onDiscard,
}: {
  before: string;
  after: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 pb-1 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
        <span className="text-sm font-semibold text-white">Beautified — keep it?</span>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X size={20} />
        </button>
      </div>
      <p className="px-6 pb-4 text-center text-xs leading-relaxed text-white/60">
        A generated product shot. Compare it with your photo before it replaces it.
      </p>

      <div className="flex flex-1 items-center gap-3 overflow-hidden px-4 pb-4">
        <figure className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={before}
              alt="Your photo"
              className="h-full w-full object-contain"
            />
          </div>
          <figcaption className="text-xs font-medium text-white/70">
            Your photo
          </figcaption>
        </figure>
        <figure className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={after}
              alt="Beautified"
              className="h-full w-full object-contain"
            />
          </div>
          <figcaption className="text-xs font-medium text-white/70">
            Beautified
          </figcaption>
        </figure>
      </div>

      <div className="flex gap-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-1">
        <button
          type="button"
          onClick={onDiscard}
          className="flex-1 rounded-2xl border border-white/25 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          Keep original
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="flex-1 rounded-2xl bg-white py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-white/90"
        >
          Use beautified
        </button>
      </div>
    </div>
  );
}
