import { requireUser } from "@/lib/auth-server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type PushBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Store a browser push subscription for the signed-in user. */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const admin = adminClient();
  if (!admin) {
    return Response.json(
      { error: "Push storage is not configured (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as PushBody;
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return Response.json({ error: "Invalid subscription payload." }, { status: 400 });
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

/** Remove a subscription by endpoint. */
export async function DELETE(request: Request) {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const admin = adminClient();
  if (!admin) {
    return Response.json({ error: "Push storage is not configured." }, { status: 503 });
  }

  const body = (await request.json()) as { endpoint?: string };
  if (!body.endpoint) {
    return Response.json({ error: "endpoint required" }, { status: 400 });
  }

  await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", body.endpoint);

  return Response.json({ ok: true });
}
