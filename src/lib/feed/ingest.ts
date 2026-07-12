import { createClient } from "@supabase/supabase-js";
import { DummyJsonProvider } from "./providers/dummyjson";
import { EbayProvider } from "./providers/ebay";
import { SkimlinksProvider } from "./providers/skimlinks";
import type { FeedProduct, FeedProvider } from "./types";

// DummyJSON is the bridge source (works with no keys); eBay + Skimlinks turn on
// once their accounts are approved. Providers that aren't configured are skipped.
const PROVIDERS: FeedProvider[] = [
  new DummyJsonProvider(),
  new EbayProvider(),
  new SkimlinksProvider(),
];

export interface IngestResult {
  ran: string[];
  skipped: string[];
  fetched: number;
  upserted: number;
  errors: string[];
}

/**
 * Pull products from every configured provider and upsert them into the
 * Supabase `products` table (service role — bypasses RLS). Providers that aren't
 * configured (no keys) are skipped, not errored, so ingest keeps working as we
 * add sources.
 */
export async function runIngest(): Promise<IngestResult> {
  const result: IngestResult = {
    ran: [],
    skipped: [],
    fetched: 0,
    upserted: 0,
    errors: [],
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    result.errors.push("Supabase service role not configured");
    return result;
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const all: FeedProduct[] = [];
  for (const p of PROVIDERS) {
    if (!p.isConfigured()) {
      result.skipped.push(p.name);
      continue;
    }
    try {
      const items = await p.fetchProducts();
      all.push(...items);
      result.ran.push(p.name);
    } catch (e) {
      result.errors.push(
        `${p.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  result.fetched = all.length;

  const now = new Date().toISOString();
  const rows = all.map((p) => ({
    id: p.id,
    source: p.source,
    title: p.title,
    brand: p.brand ?? null,
    price: p.price ?? null,
    currency: p.currency ?? null,
    image_url: p.imageUrl,
    product_url: p.productUrl,
    category: p.category ?? null,
    colors: p.colors ?? [],
    vibe_tags: p.vibeTags ?? [],
    in_stock: p.inStock ?? true,
    updated_at: now,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin
      .from("products")
      .upsert(chunk, { onConflict: "id" });
    if (error) result.errors.push(`upsert: ${error.message}`);
    else result.upserted += chunk.length;
  }

  return result;
}
