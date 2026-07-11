import type { Metadata, Viewport } from "next";
import { Geist, Libre_Baskerville } from "next/font/google";
import "./globals.css";
import { NativeAppClass } from "@/components/NativeAppClass";

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
        <NativeAppClass />
        {children}
      </body>
    </html>
  );
}
