import type { FeedProduct, FeedProvider } from "../types";

/**
 * eBay Browse API provider. Uses an application access token (OAuth2 client
 * credentials — no user consent needed for search) and pulls fashion listings
 * across a set of curated queries. If EBAY_CAMPAIGN_ID (eBay Partner Network) is
 * set, the Browse API returns affiliate-tracked buy links so clicks can earn.
 *
 * Env: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_CAMPAIGN_ID (optional).
 */

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const MARKETPLACE = "EBAY_US";
const SCOPE = "https://api.ebay.com/oauth/api_scope";

// Curated fashion queries → normalized category + vibe tags. This is what drives
// the breadth of the feed; add more rows to widen it.
const QUERIES: { q: string; category: string; vibes: string[] }[] = [
  { q: "women's dress", category: "dress", vibes: ["party", "formal"] },
  { q: "men's oxford shirt", category: "top", vibes: ["work", "minimal"] },
  { q: "denim jacket", category: "outerwear", vibes: ["casual", "streetwear"] },
  { q: "white leather sneakers", category: "shoes", vibes: ["casual", "minimal"] },
  { q: "wool blazer", category: "outerwear", vibes: ["work", "formal"] },
  { q: "knit sweater", category: "top", vibes: ["cozy", "minimal"] },
  { q: "chino trousers", category: "bottom", vibes: ["work", "casual"] },
  { q: "leather handbag", category: "bag", vibes: ["minimal", "formal"] },
  { q: "hoodie", category: "top", vibes: ["streetwear", "athleisure"] },
  { q: "midi skirt", category: "bottom", vibes: ["minimal", "work"] },
];

interface EbayItemSummary {
  itemId: string;
  title?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: { imageUrl?: string }[];
  price?: { value?: string; currency?: string };
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  brand?: string;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
  });
  if (!res.ok) {
    throw new Error(`eBay OAuth ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

export class EbayProvider implements FeedProvider {
  readonly name = "ebay";
  private clientId = process.env.EBAY_CLIENT_ID;
  private clientSecret = process.env.EBAY_CLIENT_SECRET;
  private campaignId = process.env.EBAY_CAMPAIGN_ID;
  private perQuery: number;

  constructor(perQuery = 20) {
    this.perQuery = perQuery;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  async fetchProducts(): Promise<FeedProduct[]> {
    if (!this.isConfigured()) return [];
    const token = await getToken(this.clientId!, this.clientSecret!);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
    };
    // eBay Partner Network affiliate tracking → itemAffiliateWebUrl in responses.
    if (this.campaignId) {
      headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${this.campaignId}`;
    }

    const out: FeedProduct[] = [];
    for (const { q, category, vibes } of QUERIES) {
      const url =
        `${SEARCH_URL}?q=${encodeURIComponent(q)}` +
        `&limit=${this.perQuery}` +
        `&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE}")}`;
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const json = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
        for (const it of json.itemSummaries ?? []) {
          const img = it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl;
          const buyUrl = it.itemAffiliateWebUrl || it.itemWebUrl;
          if (!img || !buyUrl || !it.title) continue;
          out.push({
            id: `ebay:${it.itemId}`,
            source: "ebay",
            title: it.title,
            brand: it.brand,
            price: it.price?.value ? Number(it.price.value) : undefined,
            currency: it.price?.currency,
            imageUrl: img,
            productUrl: buyUrl,
            category,
            colors: [],
            vibeTags: vibes,
            inStock: true,
          });
        }
      } catch {
        // Skip a failed query and keep going — one bad call shouldn't stop ingest.
      }
    }
    return out;
  }
}
