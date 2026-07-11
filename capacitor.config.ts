import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the live Next.js app in a native WebView.
 * Do not use `output: 'export'` — API routes (/api/analyze, /api/tryon, etc.)
 * must keep running on the server.
 *
 * Default: production on Vercel at `/n` (native-only entry — no website chrome).
 * Local debug against `next dev`:
 *   CAPACITOR_SERVER_URL=http://<your-Mac-LAN-IP>:3000/n npx cap sync ios
 *   (requires cleartext ATS allowance — already enabled below for http://)
 *
 * `?native=1` is a hard UI lock so AppShell always uses the native shell even
 * if Capacitor bridge / UA detection flakes (fixes website top-nav flip).
 */
function withNativeEntry(raw: string): string {
  try {
    const url = new URL(raw);
    // Prefer the dedicated native route so the WebView never boots the
    // marketing homepage that owns the website top nav.
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/n";
    }
    url.searchParams.set("native", "1");
    return url.toString();
  } catch {
    const base = raw.replace(/\/?(\?.*)?$/, "");
    return `${base}/n?native=1`;
  }
}

const serverUrl = withNativeEntry(
  process.env.CAPACITOR_SERVER_URL ??
    "https://wardrobe-app-lilac-two.vercel.app",
);

const config: CapacitorConfig = {
  appId: "app.wardrobe.personal",
  appName: "Wardrobe",
  webDir: "www",
  server: {
    url: serverUrl,
    // Needed when CAPACITOR_SERVER_URL is http:// (local Next). Harmless for https.
    cleartext: true,
  },
  ios: {
    // Let the web app own safe-area insets (viewport-fit=cover).
    contentInset: "never",
    // Critical: without this, WKWebView often uses a ~980px desktop layout.
    preferredContentMode: "mobile",
    overrideUserAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 WardrobeApp",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#faf9f7",
    },
    StatusBar: {
      style: "DEFAULT",
    },
    LocalNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
};

export default config;
