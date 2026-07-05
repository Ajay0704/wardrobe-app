"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Full-screen section with a video background that plays only while it's in
 * view (IntersectionObserver), pausing when scrolled away. Stack several to get
 * the Scale-style "scroll to reveal more video" effect. Content layers on top.
 */
export function VideoPanel({
  children,
  overlay = 0.55,
  align = "center",
  src = "/bg-video-v2.mp4",
  id,
  eager = false,
  poster,
}: {
  children: ReactNode;
  /** 0–1 darkness of the scrim over the video. */
  overlay?: number;
  align?: "center" | "start";
  src?: string;
  id?: string;
  /** Preload immediately (hero). Off-screen panels stay lazy until scrolled to. */
  eager?: boolean;
  /** Still image shown instantly while the video streams in. */
  poster?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.45 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <section
      id={id}
      className="relative flex min-h-screen items-center overflow-hidden"
      style={{
        justifyContent: align === "center" ? "center" : "flex-start",
        scrollMarginTop: "56px",
      }}
    >
      <video
        ref={ref}
        loop
        muted
        playsInline
        preload={eager ? "auto" : "none"}
        poster={poster}
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src={src} type="video/mp4" />
      </video>
      <div
        className="absolute inset-0"
        style={{ background: `rgba(11,13,17,${overlay})` }}
      />
      <div
        className={`relative z-10 mx-auto w-full max-w-6xl px-6 py-24 ${
          align === "center" ? "text-center" : "text-left"
        }`}
      >
        {children}
      </div>
    </section>
  );
}
