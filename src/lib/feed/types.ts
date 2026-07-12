/**
 * Explore feed — provider-agnostic content pipeline (AJA-93).
 *
 * The feed shows EXTERNAL online products only (no user closet content). Each
 * provider (eBay, Skimlinks, …) normalizes its catalog into `FeedProduct`, and
 * the ingestion cron upserts those into the Supabase `products` table.
 */

/** A normalized product from any feed provider, ready to upsert into `products`. */
export interface FeedProduct {
  /** Globally unique id, namespaced by source, e.g. "ebay:v1|1234|0". */
  id: string;
  /** Provider name, e.g. "ebay" | "skimlinks". */
  source: string;
  title: string;
  brand?: string;
  price?: number;
  currency?: string;
  imageUrl: string;
  /** Affiliate-wrapped buy link. */
  productUrl: string;
  /** Normalized to our Category slug where possible (top/bottom/shoes/…). */
  category?: string;
  colors?: string[];
  vibeTags?: string[];
  inStock?: boolean;
}

/** A content source for the Explore feed. */
export interface FeedProvider {
  readonly name: string;
  /** Whether this provider has the config (keys) it needs to run. */
  isConfigured(): boolean;
  /** Fetch a batch of products to ingest. Should never throw for a single bad
   *  item — return what it can. */
  fetchProducts(): Promise<FeedProduct[]>;
}
