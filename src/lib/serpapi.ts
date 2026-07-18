/**
 * SerpAPI helpers (AJA-172). `serpShopping` powers the text "Google search for
 * clothes" via engine=google_shopping — reusing the same SERPAPI_API_KEY that
 * already backs photo→product (engine=google_lens in /api/find-product). No
 * retailer partner APIs. Server-only (called from the shop-search route).
 */

export interface SerpShoppingItem {
  title: string;
  buyUrl: string;
  source: string | null; // retailer / store name
  thumbnail: string | null;
  price: number | null; // extracted numeric price
  currency: string;
  productId: string; // stable external id (SerpAPI product_id, else a url hash)
}

// Social/wiki hosts that aren't shoppable — dropped from results.
const NOISE_HOST =
  /linkedin\.|instagram\.|facebook\.|twitter\.|x\.com|tiktok\.|pinterest\.|youtube\.|reddit\.|medium\.com|wikipedia\./i;

interface RawShoppingResult {
  title?: string;
  link?: string;
  product_link?: string;
  source?: string;
  thumbnail?: string;
  price?: string;
  extracted_price?: number;
  product_id?: string;
}

function parsePrice(r: RawShoppingResult): number | null {
  if (typeof r.extracted_price === "number" && Number.isFinite(r.extracted_price)) {
    return r.extracted_price;
  }
  if (typeof r.price === "string") {
    const n = Number(r.price.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

// Stable, dependency-free hash for a fallback product id when SerpAPI omits one.
function hashUrl(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "u" + (h >>> 0).toString(36);
}

/**
 * Text product search across the open web via SerpAPI Google Shopping.
 * `start` is the SerpAPI result offset (0, 20, …) used for pagination.
 * Returns normalized, deduped, shoppable results in Google's relevance order.
 */
export async function serpShopping(
  apiKey: string,
  q: string,
  start = 0,
  num = 20,
): Promise<SerpShoppingItem[]> {
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google_shopping");
  u.searchParams.set("q", q);
  u.searchParams.set("hl", "en");
  u.searchParams.set("gl", "us");
  u.searchParams.set("num", String(num));
  u.searchParams.set("start", String(start));
  u.searchParams.set("api_key", apiKey);

  const res = await fetch(u.toString(), { signal: AbortSignal.timeout(20000) });
  const data = (await res.json()) as {
    error?: string;
    shopping_results?: RawShoppingResult[];
  };

  if (data.error) {
    // Soft "no results" — treat as empty, not an error (caller may fall back).
    if (/hasn'?t returned any results|no results/i.test(data.error)) return [];
    throw new Error(data.error);
  }
  if (!res.ok) throw new Error(`SerpAPI error (${res.status})`);

  const raw = Array.isArray(data.shopping_results) ? data.shopping_results : [];
  const seen = new Set<string>();
  const out: SerpShoppingItem[] = [];
  for (const r of raw) {
    const buyUrl = (r.product_link || r.link || "").trim();
    if (!/^https?:\/\//i.test(buyUrl)) continue;
    if (NOISE_HOST.test(buyUrl)) continue;
    const key = buyUrl.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: (r.title || r.source || "Product").trim(),
      buyUrl,
      source: r.source ?? null,
      thumbnail: r.thumbnail ?? null,
      price: parsePrice(r),
      currency: "USD",
      productId: (r.product_id && String(r.product_id)) || hashUrl(key),
    });
  }
  return out;
}
