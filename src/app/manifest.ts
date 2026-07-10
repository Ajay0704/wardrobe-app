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
    theme_color: "#b05e3c",
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
  };
}
