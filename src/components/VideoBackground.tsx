"use client";

import { useEffect, useRef } from "react";

/**
 * Looping video that fills its (relatively positioned) parent — used behind the
 * landing page only. Muted + autoplay + inline so mobile browsers allow it; a
 * theme-colored scrim keeps content readable.
 */
export function VideoBackground() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Guarantee muted (some browsers block autoplay otherwise) and kick off
    // playback, ignoring autoplay rejections on restrictive browsers.
    v.muted = true;
    v.play().catch(() => {});
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <video
        ref={ref}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="h-full w-full object-cover"
      >
        <source src="/bg-video-v2.mp4" type="video/mp4" />
      </video>
      {/* Readability scrim — tints the video toward the current theme. */}
      <div className="absolute inset-0 bg-background/60" />
    </div>
  );
}
