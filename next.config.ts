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
    return ["/bg-video-v2.mp4", "/bg-onitsuka.mp4", "/bg-goldengoose.mp4"].map(
      (source) => ({ source, headers: immutable }),
    );
  },
};

export default nextConfig;
