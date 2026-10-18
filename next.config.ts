import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strip console.* from production bundles (keeps console.error).
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  // Files in /public default to `max-age=0, must-revalidate`, so the 2.7 MB
  // background video was re-fetched on every visit. It's static content, so
  // cache it hard. (If the video is ever changed, rename the file to bust it.)
  async headers() {
    const immutable = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];
    // AJA-298: baseline browser hardening on every response. Deliberately not a full CSP yet —
    // the app loads Supabase storage, Gemini output, retailer images and on-device WASM models, and
    // a wrong script/img policy would break capture. frame-ancestors is the part that matters
    // (stops other sites framing account settings / delete for clickjacking); nothing embeds us,
    // and the iOS shell loads the site top-level, not in a frame.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=()" },
    ];
    return [
      { source: "/(.*)", headers: security },
      ...[
        "/bg-video-v2.mp4",
        "/bg-onitsuka.mp4",
        "/bg-goldengoose.mp4",
        "/hero-poster.jpg",
      ].map((source) => ({ source, headers: immutable })),
    ];
  },
};

export default nextConfig;
