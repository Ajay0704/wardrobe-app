/**
 * Closet-aware product search (AJA-116, Phase 2). Searches the shop_products
 * catalog and annotates every result with a server-computed `closetSignal`
 * (ownership + pair count) against the requesting user's snapshot closet, so the
 * grid renders the corner icon with no second round-trip.
 *
 * SEARCH_MODE seam:
 *   - "keyword" (default, shippable) — Postgres FTS on shop_products.search_tsv,
 *     falling back to ilike when the generated column isn't present yet.
 *   - "semantic" (upgrade path) — embed the query text with the SAME model as the
 *     catalog and pgvector-match. Not wired (no text embedder); the seam asserts
 *     EMBED_DIM parity and returns 501 until a model is plugged in.
 * Both modes return the identical response shape, so swapping is config-only.
 */
import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";
import { EMBED_DIM } from "@/lib/embed";
import {
  buildCompatIndex,
  closetSignal,
  type CompatRow,
  type ProductAttrs,
} from "@/lib/closet-fit";
import type { WardrobeItem } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SEARCH_MODE = (process.env.SEARCH_MODE || "keyword").toLowerCase();
const DEFAULT_LIMIT = 20;
const COLS =
  "id,brand,title,category,price_cents,currency,image_url,buy_url,fit,tone,formality,attributes";

interface Row {
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
}

function clampLimit(n: unknown): number {
  return Math.min(Math.max(Number(n) || DEFAULT_LIMIT, 1), 30);
}

function toAttrs(r: Row): ProductAttrs {
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

/** The caller's OWNED closet from the wardrobe snapshot (excludes wishlist). */
async function loadCloset(admin: SupabaseClient, userId: string): Promise<WardrobeItem[]> {
  if (!userId || userId === "local-dev") return [];
  const { data } = await admin
    .from("wardrobe_snapshots")
    .select("items")
    .eq("user_id", userId)
    .maybeSingle();
  const items = (data?.items ?? []) as WardrobeItem[];
  return Array.isArray(items) ? items.filter((i) => !i.wishlist) : [];
}

async function loadCompat(admin: SupabaseClient): Promise<CompatRow[]> {
  const { data } = await admin
    .from("outfit_compat")
    .select("source_category,target_category,weight");
  return (data ?? []) as CompatRow[];
}

/** Keyword search: FTS on search_tsv, ilike fallback. Keyset by id. */
async function keywordSearch(
  admin: SupabaseClient,
  q: string,
  cursorId: string | null,
  limit: number,
): Promise<Row[]> {
  const base = () => {
    let query = admin.from("shop_products").select(COLS).eq("in_stock", true);
    if (cursorId) query = query.gt("id", cursorId);
    return query;
  };
  // Preferred: full-text search on the generated tsvector.
  const fts = await base()
    .textSearch("search_tsv", q, { type: "websearch" })
    .order("id", { ascending: true })
    .limit(limit);
  if (!fts.error) return (fts.data ?? []) as Row[];

  // Fallback (migration not applied yet): ilike across title/brand/category.
  const pat = `%${q.replace(/[%_,()]/g, " ").trim()}%`;
  const il = await base()
    .or(`title.ilike.${pat},brand.ilike.${pat},category.ilike.${pat}`)
    .order("id", { ascending: true })
    .limit(limit);
  return (il.data ?? []) as Row[];
}

/**
 * Semantic search seam. Embeds the query text with the same model as the catalog
 * and asserts EMBED_DIM parity before any pgvector call. No text embedder is
 * wired yet, so this throws — SEARCH_MODE stays "keyword" until one is plugged in.
 */
async function embedQueryText(_q: string): Promise<number[]> {
  throw new Error(
    "SEARCH_MODE=semantic requires a text embedder (none wired). Use SEARCH_MODE=keyword.",
  );
}

async function semanticSearch(
  _admin: SupabaseClient,
  q: string,
  _cursorId: string | null,
  _limit: number,
): Promise<Row[]> {
  const embedding = await embedQueryText(q);
  if (embedding.length !== EMBED_DIM) {
    throw new Error(
      `query embedding dim ${embedding.length} != catalog EMBED_DIM ${EMBED_DIM}`,
    );
  }
  // Future: admin.rpc("match_similar", { query_embedding: toVectorLiteral(embedding), ... })
  throw new Error("semantic search not implemented");
}

async function handle(
  request: Request,
  params: { q: string; cursor: string | null; limit: unknown },
): Promise<Response> {
  const user = await requireUser(request); // catalog is public; user only scopes the closet read
  const admin = adminClient();
  if (!admin) return Response.json({ items: [], nextCursor: null });

  const q = (params.q || "").trim();
  if (q.length < 1) return Response.json({ items: [], nextCursor: null });
  const limit = clampLimit(params.limit);
  const cursorId = params.cursor || null;

  let rows: Row[];
  try {
    rows =
      SEARCH_MODE === "semantic"
        ? await semanticSearch(admin, q, cursorId, limit)
        : await keywordSearch(admin, q, cursorId, limit);
  } catch (e) {
    const status = SEARCH_MODE === "semantic" ? 501 : 500;
    return Response.json({ error: (e as Error).message || "search failed" }, { status });
  }

  const [closet, compatRows] = await Promise.all([
    loadCloset(admin, user?.id ?? "local-dev"),
    loadCompat(admin),
  ]);
  const compat = buildCompatIndex(compatRows);

  const items = rows.map((r) => ({
    productId: r.id,
    brand: r.brand,
    title: r.title,
    price: r.price_cents == null ? null : r.price_cents / 100,
    currency: r.currency ?? "USD",
    imageUrl: r.image_url,
    buyUrl: r.buy_url,
    category: r.category,
    closetSignal: closetSignal(toAttrs(r), closet, compat),
  }));

  const nextCursor =
    items.length === limit ? items[items.length - 1].productId : null;
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
