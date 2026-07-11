import type { Metadata, Viewport } from "next";
import { Geist, Libre_Baskerville } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { NativeAppClass } from "@/components/NativeAppClass";
import { NATIVE_BOOT_SCRIPT } from "@/lib/platform";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Editorial serif — Forbes / Medium-style publication wordmark */
const libreBaskerville = Libre_Baskerville({
  variable: "--font-libre",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Your Personal Wardrobe",
  description:
    "Save your clothes, build outfits, and get color-harmony suggestions.",
  applicationName: "Your Personal Wardrobe",
  // Enables full-screen "Add to Home Screen" install on iOS.
  appleWebApp: {
    capable: true,
    title: "Wardrobe",
    statusBarStyle: "default",
  },
  // Legacy tag for older iOS — modern Next emits the standardized
  // `mobile-web-app-capable`; this keeps full-screen install working everywhere.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#131211" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${libreBaskerville.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Runs before React so Capacitor never paints website chrome first. */}
        <Script id="native-boot" strategy="beforeInteractive">
          {NATIVE_BOOT_SCRIPT}
        </Script>
        <NativeAppClass />
        {children}
      </body>
    </html>
  );
}
