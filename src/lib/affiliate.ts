/**
 * Wrap an outbound product URL with affiliate parameters when configured.
 *
 * The plumbing is here; revenue turns on once you add your program tags below
 * (per retailer domain). Until then this is a transparent pass-through, so
 * links keep working with zero behaviour change.
 */
const AFFILIATE_TAGS: Record<string, Record<string, string>> = {
  // Examples — fill with your own approved program tags:
  // "www.amazon.com": { tag: "yourtag-20" },
  // "amazon.com": { tag: "yourtag-20" },
  // "shopstyle.com": { pid: "your-pid" },
};

export function affiliateUrl(raw?: string): string | undefined {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    const tags = AFFILIATE_TAGS[u.hostname.toLowerCase()];
    if (tags) {
      for (const [k, v] of Object.entries(tags)) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    return raw;
  }
}
