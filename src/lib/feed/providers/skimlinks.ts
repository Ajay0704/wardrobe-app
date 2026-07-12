import type { FeedProduct, FeedProvider } from "../types";

/**
 * Skimlinks product provider — publisher ID 306112.
 *
 * Enabled once the Skimlinks account is approved and the Product API credentials
 * are set (SKIMLINKS_API_KEY / SKIMLINKS_API_SECRET → OAuth2 client_credentials
 * → access token → Product API). Until then this is a no-op so ingestion runs on
 * the other providers (eBay) without error.
 *
 * TODO(AJA-93): implement the Product API fetch + Skimlinks link-wrapping
 * (go.skimresources.com?id=306112&url=…) once the account is live.
 */
export class SkimlinksProvider implements FeedProvider {
  readonly name = "skimlinks";
  private apiKey = process.env.SKIMLINKS_API_KEY;
  private apiSecret = process.env.SKIMLINKS_API_SECRET;

  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret);
  }

  async fetchProducts(): Promise<FeedProduct[]> {
    return [];
  }
}
