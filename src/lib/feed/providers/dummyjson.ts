import type { FeedProduct, FeedProvider } from "../types";

/**
 * DummyJSON bridge provider — a free, no-approval public product API with real
 * images/titles/brands/prices across fashion categories. Used to light up the
 * real pipeline while eBay + Skimlinks accounts await approval. It isn't a live
 * store, so each item's buy link points at a Google Shopping search for the
 * product; real affiliate links take over once eBay/Skimlinks are live.
 *
 * Enabled by default; set FEED_ENABLE_DUMMYJSON=0 to turn it off once real
 * sources are approved.
 */

const BASE = "https://dummyjson.com/products/category";

// DummyJSON fashion categories → normalized category + vibe tags.
const CATEGORIES: { slug: string; category: string; vibes: string[] }[] = [
  { slug: "mens-shirts", category: "top", vibes: ["work", "casual"] },
  { slug: "tops", category: "top", vibes: ["casual", "minimal"] },
  { slug: "womens-dresses", category: "dress", vibes: ["party", "formal"] },
  { slug: "mens-shoes", category: "shoes", vibes: ["casual"] },
  { slug: "womens-shoes", category: "shoes", vibes: ["formal", "party"] },
  { slug: "mens-watches", category: "accessory", vibes: ["minimal", "work"] },
  { slug: "womens-watches", category: "accessory", vibes: ["minimal"] },
  { slug: "womens-bags", category: "bag", vibes: ["minimal", "formal"] },
  { slug: "womens-jewellery", category: "accessory", vibes: ["party", "formal"] },
  { slug: "sunglasses", category: "accessory", vibes: ["streetwear", "casual"] },
];

interface DummyProduct {
  id: number;
  title?: string;
  brand?: string;
  price?: number;
  thumbnail?: string;
  images?: string[];
  stock?: number;
}

function shoppingUrl(title: string, brand?: string): string {
  const q = [brand, title].filter(Boolean).join(" ");
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;
}

export class DummyJsonProvider implements FeedProvider {
  readonly name = "dummyjson";

  isConfigured(): boolean {
    return process.env.FEED_ENABLE_DUMMYJSON !== "0";
  }

  async fetchProducts(): Promise<FeedProduct[]> {
    if (!this.isConfigured()) return [];
    const out: FeedProduct[] = [];
    for (const { slug, category, vibes } of CATEGORIES) {
      try {
        const res = await fetch(`${BASE}/${slug}?limit=0`);
        if (!res.ok) continue;
        const json = (await res.json()) as { products?: DummyProduct[] };
        for (const p of json.products ?? []) {
          const img = p.thumbnail || p.images?.[0];
          if (!img || !p.title) continue;
          out.push({
            id: `dummyjson:${p.id}`,
            source: "dummyjson",
            title: p.title,
            brand: p.brand,
            price: typeof p.price === "number" ? p.price : undefined,
            currency: "USD",
            imageUrl: img,
            productUrl: shoppingUrl(p.title, p.brand),
            category,
            colors: [],
            vibeTags: vibes,
            inStock: (p.stock ?? 1) > 0,
          });
        }
      } catch {
        // Skip a failed category, keep going.
      }
    }
    return out;
  }
}
