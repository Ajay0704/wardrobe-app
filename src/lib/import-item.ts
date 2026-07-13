/**
 * Shared server helpers for creating closet items from imported sources (email
 * receipts, extension order-history) — factored out of /api/clip so the import
 * pipeline reuses the exact same Storage re-host, category guess, dedupe, and
 * snapshot-upsert behaviour.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Category, WardrobeItem } from "./types";

export const BUCKET = "wardrobe-images";

/** Service-role client (bypasses RLS) — server-only. Null if unconfigured. */
export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Best-effort category from a product title. */
export function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/\b(dress|gown|romper|jumpsuit|overall)\b/.test(n)) return "dress";
  if (/\b(jean|pant|trouser|skirt|short|legging|chino)\b/.test(n)) return "bottom";
  if (/\b(shoe|sneaker|boot|heel|sandal|loafer|slipper)\b/.test(n)) return "shoes";
  if (/\b(jacket|coat|blazer|parka|puffer|cardigan|hoodie)\b/.test(n)) return "outerwear";
  if (/\b(bag|tote|purse|backpack|clutch|crossbody)\b/.test(n)) return "bag";
  if (/\b(hat|belt|scarf|jewelry|earring|necklace|bracelet|watch|sunglass)\b/.test(n))
    return "accessory";
  return "top";
}

export function normalizeUrl(u: string | null | undefined): string {
  return (u || "").trim().replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
}

/**
 * Stable dedupe key: the product URL when present, else name|brand|price. Retailer
 * receipts often have no product URL (or a tracking-wrapped one), so the fallback
 * catches those.
 */
export function dedupeKey(input: {
  name?: string;
  brand?: string;
  price?: number | null;
  productUrl?: string | null;
}): string {
  const url = normalizeUrl(input.productUrl);
  if (url) return `url:${url}`;
  const name = (input.name || "").trim().toLowerCase();
  const brand = (input.brand || "").trim().toLowerCase();
  const price = input.price == null ? "" : String(input.price);
  return `nbp:${name}|${brand}|${price}`;
}

/**
 * Fetch image bytes durably into Storage. Accepts a base64 data URL or a remote
 * URL (best-effort, short timeout). Returns the durable public URL, or null if the
 * fetch/upload failed (caller keeps the candidate with an "unavailable" flag).
 */
export async function storeImage(
  admin: SupabaseClient,
  userId: string,
  src: { imageData?: string; imageUrl?: string },
  timeoutMs = 8000,
): Promise<string | null> {
  let bytes: Buffer | null = null;
  let contentType = "image/jpeg";

  if (src.imageData?.startsWith("data:")) {
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(src.imageData);
    if (m) {
      contentType = m[1] || contentType;
      bytes = Buffer.from(m[2], "base64");
    }
  }

  if (!bytes && src.imageUrl) {
    try {
      const res = await fetch(src.imageUrl, {
        headers: { Accept: "image/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.startsWith("image/")) {
        contentType = type;
        bytes = Buffer.from(await res.arrayBuffer());
      }
    } catch {
      /* dead/expiring URL — return null */
    }
  }

  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > 8_000_000) return null;

  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    console.warn("[import] storage upload failed:", error.message);
    return null;
  }
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl || null;
}

/** Delete a Storage object by its public URL (best-effort — for retention cleanup). */
export async function removeStoredImage(admin: SupabaseClient, publicUrl: string): Promise<void> {
  const marker = `/object/public/${BUCKET}/`;
  const i = publicUrl.indexOf(marker);
  if (i === -1) return;
  const path = publicUrl.slice(i + marker.length);
  await admin.storage.from(BUCKET).remove([path]).catch(() => {});
}

/**
 * Append items to a user's wardrobe snapshot, deduped by dedupe_key against existing
 * items. Returns the items actually added.
 */
export async function addItemsToSnapshot(
  admin: SupabaseClient,
  userId: string,
  newItems: WardrobeItem[],
): Promise<WardrobeItem[]> {
  const { data: row, error } = await admin
    .from("wardrobe_snapshots")
    .select("items, outfits, trips, calendar, profile, theme, draft")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const items = Array.isArray(row?.items) ? ([...row.items] as WardrobeItem[]) : [];
  const existingKeys = new Set(
    items.map((it) => dedupeKey({ name: it.name, brand: it.brand, price: it.price, productUrl: it.productUrl })),
  );

  const added: WardrobeItem[] = [];
  for (const item of newItems) {
    const key = dedupeKey(item);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    items.unshift(item);
    added.push(item);
  }
  if (!added.length) return [];

  const { error: upErr } = await admin.from("wardrobe_snapshots").upsert(
    {
      user_id: userId,
      items,
      outfits: row?.outfits ?? [],
      trips: row?.trips ?? [],
      calendar: row?.calendar ?? [],
      profile: row?.profile ?? {},
      theme: row?.theme ?? "light",
      draft: row?.draft ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upErr) throw new Error(upErr.message);
  return added;
}
