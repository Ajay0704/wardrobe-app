/**
 * Explore redesign — Phase 2/3 foundation (AJA-155).
 *
 * Typed seams + feature flags for the parts of the reimagined Explore we are NOT
 * building yet (resale loop, on-body try-on hero, fit confidence, brand partner
 * capsules). Everything here is OFF by default and returns null/empty, so no
 * half-built UI ships — but the extension points are named and typed so Phase 2/3
 * slot in without reshaping the feed.
 *
 * Phase 1 (Today-for-you hero, occasion, Ask stylist, Wardrobe Wrapped) does NOT
 * depend on this file — it reuses existing engines directly.
 */
import type { WardrobeItem } from "@/lib/types";

/** Flags gate any future Explore section. Flip via NEXT_PUBLIC_EXPLORE_* = "1". */
export const EXPLORE_FEATURES = {
  /** Phase 2 — "Refresh your closet": resell unworn via referral links.
   *  Shipped (see src/lib/resale.ts + ResaleView); on unless explicitly disabled. */
  resale: process.env.NEXT_PUBLIC_EXPLORE_RESALE !== "0",
  /** Phase 3 — "See it on you": on-body try-on hero over /api/tryon. */
  tryOnHero: process.env.NEXT_PUBLIC_EXPLORE_TRYON === "1",
  /** Phase 3 — fit/size confidence on shop items (also the B2B data seed). */
  fitConfidence: process.env.NEXT_PUBLIC_EXPLORE_FIT === "1",
  /** Phase 3 — sponsored brand "Recreate" capsules. */
  partnerCapsules: process.env.NEXT_PUBLIC_EXPLORE_PARTNERS === "1",
} as const;

/* ----------------------------------------------------- Phase 2: resale loop */

export interface ResaleQuote {
  itemId: string;
  estimate: number;
  currency: string;
  provider: string;
  /** Deep link to list the item (referral) — filled by the concrete provider. */
  listUrl?: string;
}

export interface ResaleProvider {
  id: string;
  /** Rough resale estimate for a set of (usually unworn) items. */
  quote(items: WardrobeItem[]): Promise<ResaleQuote[]>;
  /** Where to send the user to actually list one item. */
  listUrl(item: WardrobeItem): string;
}

/** Phase 2 wires an eBay/Vinted referral provider here. Null = feature dormant. */
export const resaleProvider: ResaleProvider | null = null;

/* ------------------------------------------- Phase 3: fit / size confidence */

export interface FitSignal {
  /** Recommended size for this user, e.g. "M". */
  size: string;
  /** 0-1 confidence. */
  confidence: number;
  /** Optional "% of similar bodies who kept it" — the returns-reduction hook. */
  keepRate?: number;
}

export interface FitProvider {
  forProduct(productId: string): Promise<FitSignal | null>;
}

/** Phase 3 (needs a body profile + brand size data — the B2B data seed). */
export const fitProvider: FitProvider | null = null;

/* --------------------------------------------- Phase 3: partner capsules */

export interface PartnerCapsule {
  id: string;
  brand: string;
  title: string;
  /** Product ids in the sponsored capsule. */
  productIds: string[];
  /** Disclosure label, always shown ("Styled with …"). */
  sponsored: true;
}

export interface PartnerFeed {
  fetch(): Promise<PartnerCapsule[]>;
}

/** Phase 3 — plugged in once brand partnerships exist. */
export const partnerFeed: PartnerFeed | null = null;

/* --------------------------------------------- Phase 3: on-body try-on hero */

/** The Explore try-on hero maps onto the existing /api/tryon pipeline; this
 *  interface just reserves the shape so the hero can be built behind the flag. */
export interface TryOnHeroConfig {
  /** Whether the user has a reusable body photo / avatar on file. */
  hasAvatar: boolean;
  /** Provider id backing the render (e.g. "fashn" | "gemini"). */
  provider: string;
}
