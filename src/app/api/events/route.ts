import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const TYPES = new Set(["view", "grab", "own", "wishlist", "shop_click", "purchase", "decision"]);

/** Fire-and-forget telemetry — the training + moat data. Never fails the caller hard. */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return Response.json({ ok: false }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { type, postId, productId, garmentId, payload } = body ?? {};
  if (!TYPES.has(type)) return Response.json({ ok: false, error: "bad type" }, { status: 400 });

  const admin = adminClient();
  if (admin) {
    await admin
      .from("events")
      .insert({
        user_id: user.id === "local-dev" ? null : user.id,
        type,
        post_ref: postId ?? null,
        product_id: productId ?? null,
        garment_id: garmentId ?? null,
        payload: payload ?? {},
      })
      .then(() => {}, () => {}); // swallow — telemetry must not break UX
  }
  return Response.json({ ok: true });
}
