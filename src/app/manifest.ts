import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Your Personal Wardrobe",
    short_name: "Wardrobe",
    description:
      "Save your clothes, build outfits, and get color-harmony suggestions.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f7",
    theme_color: "#567a4a",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Web Share Target (installed PWA on Android/Chromebook — never iOS Safari; the
    // iOS Share Extension covers that). A shared link lands on /n?clipUrl=… (or is
    // pulled from the shared text) and ClipLinkLoader quick-saves it to the wishlist.
    // `share_target` isn't in Next's Manifest type yet, so it's attached via a cast.
    share_target: {
      action: "/n",
      method: "GET",
      params: { title: "clipTitle", text: "clipText", url: "clipUrl" },
    },
  } as MetadataRoute.Manifest;
}
