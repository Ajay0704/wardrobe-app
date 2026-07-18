/**
 * Client data layer for closet-aware product search (AJA-116). Thin wrappers over
 * /api/shop/search and /api/shop/product/[id], carrying the Bearer token so the
 * routes can scope the closet read to the signed-in user. Mirrors the graceful
 * degradation of community.ts — returns empty/null instead of throwing.
 */
import { authHeaders } from "./supabase/client";

export type OwnStatus = "exact" | "similar" | "type" | "none";

export interface ClosetSignal {
  owned: OwnStatus;
  pairCount: number;
}

export interface ShopResult {
  productId: string;
  brand: string | null;
  title: string;
  price: number | null;
  currency: string;
  imageUrl: string;
  buyUrl: string;
  category: string;
  tone: string | null; // product colour (ingest); lets the ranker honour a colour-specific query
  closetSignal: ClosetSignal;
}

export interface Ownership {
  status: OwnStatus;
  matchedGarmentId?: string;
  note: string;
}

export interface Pairing {
  total: number;
  byCategory: Record<string, number>;
  matches: string[];
}

export interface ProductFit {
  product: {
    productId: string;
    brand: string | null;
    title: string;
    price: number | null;
    currency: string;
    imageUrl: string;
    buyUrl: string;
    category: string;
    fit: string | null;
    tone: string | null;
    formality: string | null;
  };
  ownership: Ownership;
  pairing: Pairing;
}

export async function searchProducts(
  q: string,
  cursor?: string | null,
): Promise<{ items: ShopResult[]; nextCursor: string | null }> {
  const query = q.trim();
  if (!query) return { items: [], nextCursor: null };
  const sp = new URLSearchParams({ q: query });
  if (cursor) sp.set("cursor", cursor);
  try {
    const res = await fetch(`/api/shop/search?${sp.toString()}`, {
      headers: { ...(await authHeaders()) },
    });
    if (!res.ok) return { items: [], nextCursor: null };
    return (await res.json()) as { items: ShopResult[]; nextCursor: string | null };
  } catch {
    return { items: [], nextCursor: null };
  }
}

export async function fetchProductFit(id: string): Promise<ProductFit | null> {
  try {
    const res = await fetch(`/api/shop/product/${encodeURIComponent(id)}`, {
      headers: { ...(await authHeaders()) },
    });
    if (!res.ok) return null;
    return (await res.json()) as ProductFit;
  } catch {
    return null;
  }
}

/** Wishlist a catalog product (best-effort; requires a signed-in user server-side). */
export async function wishlistProduct(productId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ productId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
