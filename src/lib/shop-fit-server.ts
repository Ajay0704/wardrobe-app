/**
 * Server-side helpers shared by the closet-aware shop routes (AJA-116): the
 * shop_products select shape, mapping a row to comparison attributes, and
 * loading the caller's snapshot closet + the outfit_compat weights. Server-only
 * (uses the service-role admin client). Never import from client components.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompatRow, ProductAttrs } from "./closet-fit";
import type { WardrobeItem } from "./types";

/** Columns selected from shop_products for search + detail. */
export const PRODUCT_COLS =
  "id,brand,title,category,price_cents,currency,image_url,buy_url,fit,tone,formality,attributes,in_stock";

export interface ProductRow {
  id: string;
  brand: string | null;
  title: string;
  category: string;
  price_cents: number | null;
  currency: string | null;
  image_url: string;
  buy_url: string;
  fit: string | null;
  tone: string | null;
  formality: string | null;
  attributes: Record<string, unknown> | null;
  in_stock?: boolean | null;
}

/** shop_products row → the minimal attributes the comparison reads (jsonb fallback). */
export function toProductAttrs(r: ProductRow): ProductAttrs {
  const a = r.attributes ?? {};
  return {
    id: r.id,
    category: r.category,
    fit: r.fit ?? (a.fit as string | undefined) ?? null,
    tone: r.tone ?? (a.tone as string | undefined) ?? (a.color as string | undefined) ?? null,
    formality: r.formality ?? (a.formality as string | undefined) ?? null,
    colorName: (a.colorName as string | undefined) ?? null,
  };
}

/**
 * The caller's OWNED closet from the wardrobe snapshot (excludes wishlist items).
 * Empty for local-dev / no user — closet signals then degrade to none/0.
 */
export async function loadCloset(
  admin: SupabaseClient,
  userId: string,
): Promise<WardrobeItem[]> {
  if (!userId || userId === "local-dev") return [];
  const { data } = await admin
    .from("wardrobe_snapshots")
    .select("items")
    .eq("user_id", userId)
    .maybeSingle();
  const items = (data?.items ?? []) as WardrobeItem[];
  return Array.isArray(items) ? items.filter((i) => !i.wishlist) : [];
}

/** outfit_compat weights (small table; load once per request). */
export async function loadCompat(admin: SupabaseClient): Promise<CompatRow[]> {
  const { data } = await admin
    .from("outfit_compat")
    .select("source_category,target_category,weight");
  return (data ?? []) as CompatRow[];
}
