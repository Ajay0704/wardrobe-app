import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strip console.* from production bundles (keeps console.error).
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
};

export default nextConfig;
