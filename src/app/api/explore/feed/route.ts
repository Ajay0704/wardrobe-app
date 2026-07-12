import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PAGE = 20;
const MAX_PAGE = 40;

interface ProductRow {
  id: string;
  seq: number;
  source: string;
  title: string;
  brand: string | null;
  price: number | null;
  currency: string | null;
  image_url: string;
  product_url: string;
  category: string | null;
  colors: string[] | null;
  vibe_tags: string[] | null;
  saves: number | null;
}

/**
 * Explore feed API. Keyset pagination on the monotonic `seq` column (robust for
 * infinite scroll — no offset drift as the catalog changes). Returns external
 * products only; the client overlays closet-match against the user's own items.
 *
 * GET /api/explore/feed?cursor=<seq>&vibe=<tag>&category=<slug>&limit=<n>
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return Response.json({ items: [], nextCursor: null });
  }

  const sp = new URL(request.url).searchParams;
  const vibe = sp.get("vibe");
  const category = sp.get("category");
  const cursor = sp.get("cursor");
  const ids = sp.get("ids");
  const limit = Math.min(Number(sp.get("limit")) || PAGE, MAX_PAGE);

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cols =
    "id,seq,source,title,brand,price,currency,image_url,product_url,category,colors,vibe_tags,saves";

  // ids mode: fetch a specific set of products (used by the Saved tab). No paging.
  if (ids) {
    const idList = ids.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
    const { data, error } = await db
      .from("products")
      .select(cols)
      .in("id", idList);
    if (error) {
      return Response.json(
        { items: [], nextCursor: null, error: error.message },
        { status: 500 },
      );
    }
    const items = ((data ?? []) as ProductRow[]).map(toItem);
    return Response.json({ items, nextCursor: null });
  }

  let q = db
    .from("products")
    .select(cols)
    .eq("in_stock", true)
    .order("seq", { ascending: false })
    .limit(limit + 1);

  if (vibe) q = q.contains("vibe_tags", [vibe]);
  if (category) q = q.eq("category", category);
  if (cursor && Number.isFinite(Number(cursor))) q = q.lt("seq", Number(cursor));

  const { data, error } = await q;
  if (error) {
    return Response.json(
      { items: [], nextCursor: null, error: error.message },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as ProductRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items = page.map(toItem);
  const nextCursor =
    hasMore && page.length ? String(page[page.length - 1].seq) : null;

  return Response.json({ items, nextCursor });
}

function toItem(r: ProductRow) {
  return {
    id: r.id,
    source: r.source,
    title: r.title,
    brand: r.brand ?? undefined,
    price: r.price ?? undefined,
    currency: r.currency ?? undefined,
    imageUrl: r.image_url,
    productUrl: r.product_url,
    category: r.category ?? undefined,
    colors: r.colors ?? [],
    vibeTags: r.vibe_tags ?? [],
    saves: r.saves ?? 0,
  };
}
