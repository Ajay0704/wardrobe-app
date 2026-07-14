/**
 * Closet-aware product detail (AJA-116, Phase 3). Returns the catalog product
 * plus the full closet read for the requesting user: an ownership verdict and a
 * pairing score broken down by category with the matched closet-item ids.
 *
 * Read-only and per-user: the closet is scoped to `requireUser` id via the
 * snapshot, so account A never sees account B's pairing.
 */
import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";
import { buildCompatIndex, scoreAgainstCloset } from "@/lib/closet-fit";
import {
  PRODUCT_COLS,
  loadCloset,
  loadCompat,
  toProductAttrs,
  type ProductRow,
} from "@/lib/shop-fit-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!id) return Response.json({ error: "id required." }, { status: 400 });

  const user = await requireUser(request); // scopes the closet read only
  const admin = adminClient();
  if (!admin) return Response.json({ error: "not configured" }, { status: 503 });

  const { data: row, error } = await admin
    .from("shop_products")
    .select(PRODUCT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!row) return Response.json({ error: "product not found" }, { status: 404 });

  const r = row as ProductRow;
  const [closet, compatRows] = await Promise.all([
    loadCloset(admin, user?.id ?? "local-dev"),
    loadCompat(admin),
  ]);
  const compat = buildCompatIndex(compatRows);
  const { ownership, pairing } = scoreAgainstCloset(toProductAttrs(r), closet, compat);

  return Response.json({
    product: {
      productId: r.id,
      brand: r.brand,
      title: r.title,
      price: r.price_cents == null ? null : r.price_cents / 100,
      currency: r.currency ?? "USD",
      imageUrl: r.image_url,
      buyUrl: r.buy_url,
      category: r.category,
      fit: r.fit ?? null,
      tone: r.tone ?? null,
      formality: r.formality ?? null,
    },
    ownership,
    pairing,
  });
}
