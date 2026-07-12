import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PAGE = 18;
const MAX_PAGE = 40;

interface LookRow {
  id: string;
  seq: number;
  kind: "look" | "editorial" | "product";
  gender: "male" | "female" | "unisex";
  title: string;
  subtitle: string | null;
  vibes: string[] | null;
  ratio: number | null;
  hero_image: string | null;
  product_ids: string[] | null;
  saves: number | null;
}

interface ProductRow {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  currency: string | null;
  image_url: string;
  product_url: string;
  category: string | null;
  gender: string | null;
  vibe_tags: string[] | null;
}

interface Piece {
  id: string;
  title: string;
  brand?: string;
  price?: number;
  currency?: string;
  imageUrl: string;
  productUrl: string;
  category?: string;
}

const LOOK_COLS =
  "id,seq,kind,gender,title,subtitle,vibes,ratio,hero_image,product_ids,saves";
const PRODUCT_COLS =
  "id,title,brand,price,currency,image_url,product_url,category,gender,vibe_tags";

function toPiece(r: ProductRow): Piece {
  return {
    id: r.id,
    title: r.title,
    brand: r.brand ?? undefined,
    price: r.price ?? undefined,
    currency: r.currency ?? undefined,
    imageUrl: r.image_url,
    productUrl: r.product_url,
    category: r.category ?? undefined,
  };
}

function genderFilter(gender: string | null): string[] | null {
  if (gender === "male") return ["male", "unisex"];
  if (gender === "female") return ["female", "unisex"];
  return null; // "all"/unset → everything
}

/**
 * Explore content feed API. Serves composed "looks" (outfit ideas), editorial
 * inspiration, and trending products from the `looks` table, gender-filtered,
 * keyset-paginated on `seq`. Product pieces are resolved so the client can render
 * shoppable collages; editorial cards get "shop similar" products by vibe.
 *
 * GET /api/explore/feed?gender=male|female|all&cursor=<seq>&limit=<n>
 * GET /api/explore/feed?ids=a,b,c   (Saved — fetch specific feed cards)
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ items: [], nextCursor: null });

  const sp = new URL(request.url).searchParams;
  const gender = sp.get("gender");
  const cursor = sp.get("cursor");
  const ids = sp.get("ids");
  const limit = Math.min(Number(sp.get("limit")) || PAGE, MAX_PAGE);

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let rows: LookRow[];
  let nextCursor: string | null = null;

  if (ids) {
    const idList = ids.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
    const { data, error } = await db.from("looks").select(LOOK_COLS).in("id", idList);
    if (error) {
      return Response.json({ items: [], nextCursor: null, error: error.message }, { status: 500 });
    }
    rows = (data ?? []) as LookRow[];
  } else {
    // Ascending seq = the composer's balanced interleave order (looks · editorial ·
    // product), so the content-first mix leads the feed instead of the tail.
    let q = db
      .from("looks")
      .select(LOOK_COLS)
      .order("seq", { ascending: true })
      .limit(limit + 1);
    const gf = genderFilter(gender);
    if (gf) q = q.in("gender", gf);
    if (cursor && Number.isFinite(Number(cursor))) q = q.gt("seq", Number(cursor));

    const { data, error } = await q;
    if (error) {
      return Response.json({ items: [], nextCursor: null, error: error.message }, { status: 500 });
    }
    const all = (data ?? []) as LookRow[];
    const hasMore = all.length > limit;
    rows = hasMore ? all.slice(0, limit) : all;
    nextCursor = hasMore && rows.length ? String(rows[rows.length - 1].seq) : null;
  }

  // Resolve the product pieces referenced by look/product cards.
  const needIds = new Set<string>();
  for (const r of rows) for (const id of r.product_ids ?? []) needIds.add(id);
  const pieceMap = new Map<string, Piece>();
  if (needIds.size) {
    const { data } = await db.from("products").select(PRODUCT_COLS).in("id", [...needIds]);
    for (const p of (data ?? []) as ProductRow[]) pieceMap.set(p.id, toPiece(p));
  }

  // For editorial cards, fetch a gender pool once to compute "shop similar".
  const hasEditorial = rows.some((r) => r.kind === "editorial");
  let pool: ProductRow[] = [];
  if (hasEditorial) {
    let pq = db.from("products").select(PRODUCT_COLS).eq("in_stock", true).limit(120);
    const gf = genderFilter(gender);
    if (gf) pq = pq.in("gender", gf);
    const { data } = await pq;
    pool = (data ?? []) as ProductRow[];
  }
  const similarFor = (vibes: string[]): Piece[] => {
    const scored = pool
      .map((p) => ({
        p,
        score: (p.vibe_tags ?? []).filter((v) => vibes.includes(v)).length,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const chosen = (scored.length ? scored.map((x) => x.p) : pool).slice(0, 6);
    return chosen.map(toPiece);
  };

  const items = rows.map((r) => {
    const pieces =
      r.kind === "editorial"
        ? similarFor(r.vibes ?? [])
        : (r.product_ids ?? []).map((id) => pieceMap.get(id)).filter((x): x is Piece => !!x);
    return {
      id: r.id,
      kind: r.kind,
      gender: r.gender,
      title: r.title,
      subtitle: r.subtitle ?? undefined,
      vibes: r.vibes ?? [],
      ratio: r.ratio ?? 1.2,
      heroImage: r.hero_image ?? undefined,
      pieces,
      saves: r.saves ?? 0,
    };
  });

  return Response.json({ items, nextCursor });
}
