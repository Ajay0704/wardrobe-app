/**
 * Closet-aware product search (AJA-116, AJA-172). Primary backend is a live
 * "Google search for clothes" — SerpAPI engine=google_shopping (text) — reusing
 * the same SERPAPI_API_KEY that powers photo→product. Each web result is upserted
 * into shop_products so the product-detail overlay, "your size" chip, and wishlist
 * keep resolving by id. Results are annotated with a server-computed `closetSignal`
 * (ownership + pair count) against the caller's snapshot closet.
 *
 * Cost controls: search fires on submit (client), a 24h `shop_search_cache` avoids
 * re-billing repeat queries, and pagination is capped. If SERPAPI_API_KEY is
 * missing or SerpAPI errors/returns nothing, it falls back to the legacy Postgres
 * full-text search over the (DummyJSON-seeded) catalog. Never throws to the client.
 */
import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";
import { buildCompatIndex, closetSignal, type CompatIndex } from "@/lib/closet-fit";
import {
  PRODUCT_COLS,
  loadCloset,
  loadCompat,
  toProductAttrs,
  type ProductRow,
} from "@/lib/shop-fit-server";
import { serpShopping, type SerpShoppingItem } from "@/lib/serpapi";
import { classifyCategory, classifyFit, classifyFormality, parseColor, stripBrand } from "@/lib/shop-category";
import type { WardrobeItem } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_LIMIT = 20;
const PAGE_SIZE = 20; // SerpAPI results per page
const PAGE_CAP_START = 60; // stop after ~3 pages to bound SerpAPI credits
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const clampLimit = (n: unknown): number => Math.min(Math.max(Number(n) || DEFAULT_LIMIT, 1), 30);
const normQuery = (q: string): string => q.trim().toLowerCase().replace(/\s+/g, " ");

function rowsToItems(rows: ProductRow[], closet: WardrobeItem[], compat: CompatIndex) {
  return rows.map((r) => ({
    productId: r.id,
    brand: r.brand,
    title: r.title,
    price: r.price_cents == null ? null : r.price_cents / 100,
    currency: r.currency ?? "USD",
    imageUrl: r.image_url,
    buyUrl: r.buy_url,
    category: r.category,
    tone: toProductAttrs(r).tone,
    closetSignal: closetSignal(toProductAttrs(r), closet, compat),
  }));
}

const orderByIds = (rows: ProductRow[], ids: string[]): ProductRow[] => {
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => by.get(id)).filter((r): r is ProductRow => Boolean(r));
};

const orderByBuyUrl = (rows: ProductRow[], results: SerpShoppingItem[]): ProductRow[] => {
  const rank = new Map(results.map((r, i) => [r.buyUrl, i]));
  return [...rows].sort((a, b) => (rank.get(a.buy_url) ?? 999) - (rank.get(b.buy_url) ?? 999));
};

/** Read the (query, start) cache. Defensive: returns null if the table is absent. */
async function readCache(
  admin: SupabaseClient,
  query: string,
  start: number,
): Promise<string[] | null> {
  try {
    const { data, error } = await admin
      .from("shop_search_cache")
      .select("product_ids, fetched_at")
      .eq("query_norm", query)
      .eq("start", start)
      .maybeSingle();
    if (error || !data) return null;
    if (Date.now() - new Date(data.fetched_at).getTime() > CACHE_TTL_MS) return null;
    return (data.product_ids ?? []) as string[];
  } catch {
    return null;
  }
}

/** Write the (query, start) cache. Defensive: no-ops if the table is absent. */
async function writeCache(
  admin: SupabaseClient,
  query: string,
  start: number,
  ids: string[],
): Promise<void> {
  try {
    await admin.from("shop_search_cache").upsert(
      { query_norm: query, start, product_ids: ids, fetched_at: new Date().toISOString() },
      { onConflict: "query_norm,start" },
    );
  } catch {
    /* table not migrated yet — skip caching, search still works */
  }
}

/**
 * Web product search: cache → SerpAPI Google Shopping → upsert into shop_products
 * (so ids resolve for detail/wishlist) → cache the ids. Returns catalog rows in
 * SerpAPI relevance order. Throws on SerpAPI/DB failure (caller falls back to FTS).
 */
async function webSearch(
  admin: SupabaseClient,
  apiKey: string,
  q: string,
  start: number,
  query: string,
): Promise<ProductRow[]> {
  const cachedIds = await readCache(admin, query, start);
  if (cachedIds && cachedIds.length) {
    const { data } = await admin.from("shop_products").select(PRODUCT_COLS).in("id", cachedIds);
    const rows = orderByIds((data ?? []) as ProductRow[], cachedIds);
    if (rows.length) return rows;
  }

  const results = await serpShopping(apiKey, q, start, PAGE_SIZE);
  const usable = results.filter((r) => r.thumbnail && r.buyUrl);
  if (!usable.length) return [];

  const upserts = usable.map((r) => {
    const category = classifyCategory(r.title, q);
    // Brand-strip first so brand colour-tokens ("Old Navy" → navy) can't poison the
    // tone; then title colour; then fall back to the query's colour ("black jeans"
    // whose titles omit "black") so neutral-colour searches carry what was asked (AJA-177).
    const tone = parseColor(stripBrand(r.title, r.source)) ?? parseColor(q);
    // Write the discriminating attributes (tone/fit/formality) as top-level columns so
    // closetScore varies item-to-item — without them the closet ranker degenerates to a
    // per-category constant (AJA-175). `toProductAttrs` reads these columns first.
    return {
      source: "serpapi",
      external_id: r.productId,
      brand: r.source,
      title: r.title,
      category,
      price_cents: r.price == null ? null : Math.round(r.price * 100),
      currency: r.currency,
      image_url: r.thumbnail as string,
      buy_url: r.buyUrl,
      tone,
      fit: classifyFit(r.title),
      formality: classifyFormality(r.title, category),
      attributes: { colorName: tone, color: tone, source_name: r.source },
      in_stock: true,
      // Store the originating query (the same input classifyCategory used) so
      // categories self-heal via fixed ingest and any future re-derive is lossless.
      source_query: q,
    };
  });

  const { data, error } = await admin
    .from("shop_products")
    .upsert(upserts, { onConflict: "source,external_id" })
    .select(PRODUCT_COLS);
  if (error) throw new Error(error.message);

  const rows = orderByBuyUrl((data ?? []) as ProductRow[], usable);
  if (rows.length) await writeCache(admin, query, start, rows.map((r) => r.id));
  return rows;
}

/** Legacy fallback: Postgres FTS on shop_products.search_tsv, ilike fallback. Keyset by id. */
async function keywordSearch(
  admin: SupabaseClient,
  q: string,
  cursorId: string | null,
  limit: number,
): Promise<ProductRow[]> {
  const base = () => {
    let query = admin.from("shop_products").select(PRODUCT_COLS).eq("in_stock", true);
    if (cursorId) query = query.gt("id", cursorId);
    return query;
  };
  const fts = await base()
    .textSearch("search_tsv", q, { type: "websearch" })
    .order("id", { ascending: true })
    .limit(limit);
  if (!fts.error) return (fts.data ?? []) as ProductRow[];

  const pat = `%${q.replace(/[%_,()]/g, " ").trim()}%`;
  const il = await base()
    .or(`title.ilike.${pat},brand.ilike.${pat},category.ilike.${pat}`)
    .order("id", { ascending: true })
    .limit(limit);
  return (il.data ?? []) as ProductRow[];
}

async function handle(
  request: Request,
  params: { q: string; cursor: string | null; limit: unknown },
): Promise<Response> {
  const user = await requireUser(request); // catalog is public; user only scopes the closet read
  const admin = adminClient();
  if (!admin) return Response.json({ items: [], nextCursor: null });

  const q = (params.q || "").trim();
  if (q.length < 2) return Response.json({ items: [], nextCursor: null });
  const limit = clampLimit(params.limit);
  const query = normQuery(q);
  const cursor = params.cursor || null;
  const apiKey = process.env.SERPAPI_API_KEY;

  const [closet, compatRows] = await Promise.all([
    loadCloset(admin, user?.id ?? "local-dev"),
    loadCompat(admin),
  ]);
  const compat = buildCompatIndex(compatRows);

  // Primary: live web search. Cursor encodes the SerpAPI `start` offset.
  if (apiKey) {
    const start = Number(cursor) || 0;
    try {
      const rows = await webSearch(admin, apiKey, q, start, query);
      if (rows.length) {
        const nextCursor =
          rows.length >= 15 && start + PAGE_SIZE < PAGE_CAP_START ? String(start + PAGE_SIZE) : null;
        return Response.json({ items: rowsToItems(rows, closet, compat), nextCursor });
      }
      // no web results — fall through to the catalog FTS
    } catch {
      // SerpAPI/DB failure — fall through to the catalog FTS (never throw to client)
    }
  }

  // Fallback: catalog full-text search (cursor here is a product id, not an offset).
  const cursorId = cursor && !/^\d+$/.test(cursor) ? cursor : null;
  const rows = await keywordSearch(admin, q, cursorId, limit).catch(() => [] as ProductRow[]);
  const items = rowsToItems(rows, closet, compat);
  const nextCursor = items.length === limit ? items[items.length - 1].productId : null;
  return Response.json({ items, nextCursor });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  return handle(request, { q: body.q, cursor: body.cursor ?? null, limit: body.limit });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handle(request, {
    q: url.searchParams.get("q") ?? "",
    cursor: url.searchParams.get("cursor"),
    limit: url.searchParams.get("limit"),
  });
}
