import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";
import { toneToHex } from "@/lib/color";
import { dominantColorFromUrl } from "@/lib/color-server";
import { parseColor } from "@/lib/shop-category";

export const runtime = "nodejs";

/** "Add to wishlist" — a pictured item (from a detection) or a catalog product (heart on a shop card). */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") {
    return Response.json({ error: "Sign in to save to your wishlist." }, { status: 401 });
  }
  const { detectionId, productId } = await request.json().catch(() => ({}));
  if (!detectionId && !productId) {
    return Response.json({ error: "detectionId or productId required." }, { status: 400 });
  }

  const admin = adminClient();
  if (!admin) return Response.json({ error: "Not configured." }, { status: 500 });

  // price/currency/product_url are carried through so an absorbed save keeps the
  // fields the wishlist actually renders (AJA-241) — a save that loses its price and
  // its buy link is only half a save.
  let row: {
    kind: string;
    product_id: string | null;
    name: string | null;
    category: string | null;
    image_url: string | null;
    source_ref: string | null;
    price_cents: number | null;
    currency: string | null;
    product_url: string | null;
    color: string | null;
  };

  if (productId) {
    const { data: p, error } = await admin
      .from("shop_products")
      .select("brand,title,category,image_url,price_cents,currency,buy_url,tone")
      .eq("id", productId)
      .single();
    if (error || !p) return Response.json({ error: "product not found" }, { status: 404 });
    row = {
      kind: "product",
      product_id: productId,
      name: [p.brand, p.title].filter(Boolean).join(" · ") || p.title,
      category: p.category,
      image_url: p.image_url,
      source_ref: null,
      price_cents: p.price_cents ?? null,
      currency: p.currency ?? null,
      product_url: p.buy_url ?? null,
      // Cheapest first: the catalog's own tone, then the title, then the image bytes.
      // Most shop rows carry a tone already (AJA-175), so this usually costs nothing.
      color:
        toneToHex(p.tone) ??
        toneToHex(parseColor(`${p.brand ?? ""} ${p.title}`)) ??
        (await dominantColorFromUrl(p.image_url)),
    };
  } else {
    const { data: det, error } = await admin
      .from("detections")
      .select("name,category,crop_path,source_ref,attributes")
      .eq("id", detectionId)
      .single();
    if (error || !det) return Response.json({ error: "detection not found" }, { status: 404 });
    row = {
      kind: "pictured",
      product_id: null,
      name: det.name,
      category: det.category,
      image_url: det.crop_path,
      source_ref: det.source_ref,
      // A garment spotted in a photo has no price or retailer to carry.
      price_cents: null,
      currency: null,
      product_url: null,
      // Stamped at detection time from the crop bytes; older rows fall back to the crop.
      color:
        (det.attributes as { color?: string } | null)?.color ??
        (await dominantColorFromUrl(det.crop_path)),
    };
  }

  const wishlistId = crypto.randomUUID();
  const { error: we } = await admin.from("wishlist_items").insert({ id: wishlistId, user_id: user.id, ...row });
  if (we) return Response.json({ error: we.message }, { status: 500 });

  await admin.from("events").insert({
    user_id: user.id,
    type: "wishlist",
    product_id: row.product_id,
    post_ref: row.source_ref,
    payload: { kind: row.kind, category: row.category },
  });

  return Response.json({ wishlistId });
}
