"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

/**
 * Full-screen photo lightbox with pinch / double-tap / wheel zoom + pan (AJA-204).
 * Opened by tapping the item photo inside the edit form — the closet grid still
 * taps straight to Edit. Escape or the ✕ closes; body scroll is locked while open.
 */
export function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black/95">
      <div className="flex justify-end px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <TransformWrapper
          initialScale={1}
          minScale={1}
          maxScale={5}
          centerOnInit
          doubleClick={{ mode: "toggle", step: 2.6 }}
          wheel={{ step: 0.15 }}
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ width: "100%", height: "100%" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Enlarged item photo"
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>

      <p className="pb-[calc(env(safe-area-inset-bottom,0px)+14px)] pt-2 text-center text-xs text-white/50">
        Pinch or double-tap to zoom
      </p>
    </div>
  );
}
