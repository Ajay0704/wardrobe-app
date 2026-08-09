import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * AJA-286 · Store an APNs device token for the signed-in user (iOS remote push).
 * The native app POSTs the token from the `@capacitor/push-notifications` 'registration'
 * event on every launch (tokens rotate on reinstall/restore/OS update), so this upserts.
 * Mirrors /api/push/subscribe (web) — the aging-wishlist cron reads these rows to send.
 */
type Body = { token?: string; platform?: string };

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) {
    return Response.json({ error: "Push storage is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return Response.json({ error: "token required" }, { status: 400 });
  }

  const { error } = await admin.from("device_push_tokens").upsert(
    {
      token,
      user_id: user.id,
      platform: body.platform === "android" ? "android" : "ios",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

/** Remove a device token (sign-out / notifications disabled). */
export async function DELETE(request: Request) {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return Response.json({ error: "Push storage is not configured." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  await admin.from("device_push_tokens").delete().eq("user_id", user.id).eq("token", token);
  return Response.json({ ok: true });
}
