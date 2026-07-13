/**
 * Server helpers for the shop feeds (AJA-97). Loads a persisted detection's
 * embedding and runs the vector-match RPCs (match_similar / match_complements),
 * paginating by carrying seen product ids in an opaque cursor (vector search
 * has no stable offset, so we exclude what we've already returned).
 */
import { adminClient } from "@/lib/supabase/admin";

export type ShopTag = "similar" | "goes-with";

export interface ShopItem {
  productId: string;
  brand: string | null;
  title: string;
  priceCents: number | null;
  currency: string;
  imageUrl: string;
  buyUrl: string;
  category: string;
  tag: ShopTag;
}

interface ProductRow {
  id: string;
  brand: string | null;
  title: string;
  price_cents: number | null;
  currency: string | null;
  image_url: string;
  buy_url: string;
  category: string;
}

export function mapProduct(r: ProductRow, tag: ShopTag): ShopItem {
  return {
    productId: r.id,
    brand: r.brand,
    title: r.title,
    priceCents: r.price_cents,
    currency: r.currency ?? "USD",
    imageUrl: r.image_url,
    buyUrl: r.buy_url,
    category: r.category,
    tag,
  };
}

function decodeCursor(c: string | null | undefined): string[] {
  if (!c) return [];
  try {
    const arr = JSON.parse(Buffer.from(c, "base64").toString("utf8"));
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

function encodeCursor(ids: string[]): string {
  return Buffer.from(JSON.stringify(ids)).toString("base64");
}

export interface MatchResult {
  items: ShopItem[];
  nextCursor: string | null;
  error?: string;
}

export async function runMatch(
  rpc: "match_similar" | "match_complements",
  detectionId: string,
  cursor: string | null,
  limit: number,
  tag: ShopTag,
): Promise<MatchResult> {
  const admin = adminClient();
  if (!admin) return { items: [], nextCursor: null, error: "not configured" };

  const { data: det, error: de } = await admin
    .from("detections")
    .select("embedding,category")
    .eq("id", detectionId)
    .single();
  if (de || !det?.embedding) {
    return { items: [], nextCursor: null, error: de?.message ?? "detection not found" };
  }

  const exclude = decodeCursor(cursor);
  const { data, error } = await admin.rpc(rpc, {
    query_embedding: det.embedding,
    in_category: det.category,
    exclude_ids: exclude,
    match_count: limit,
  });
  if (error) return { items: [], nextCursor: null, error: error.message };

  const items = ((data ?? []) as ProductRow[]).map((r) => mapProduct(r, tag));
  const nextCursor =
    items.length === limit ? encodeCursor([...exclude, ...items.map((i) => i.productId)]) : null;
  return { items, nextCursor };
}
