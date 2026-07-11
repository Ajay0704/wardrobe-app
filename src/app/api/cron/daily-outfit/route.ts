import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron: morning outfit nudge + Sunday weekly plan reminder.
 * Protect with Authorization: Bearer $CRON_SECRET (Vercel sets this automatically
 * when CRON_SECRET is configured).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (secret && auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@example.com";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!publicKey || !privateKey) {
    return Response.json(
      { ok: false, skipped: true, reason: "VAPID keys not configured" },
      { status: 200 },
    );
  }
  if (!url || !serviceKey) {
    return Response.json(
      { ok: false, skipped: true, reason: "Supabase service role not configured" },
      { status: 200 },
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const day = new Date().getUTCDay(); // 0 = Sunday
  const weekly = day === 0;
  const payload = JSON.stringify(
    weekly
      ? {
          title: "Plan your week",
          body: "Open Wardrobe and sketch a few looks for the days ahead.",
          url: "/?view=calendar",
        }
      : {
          title: "Here's today's outfit",
          body: "Weather-aware suggestions are ready — tap to open Today.",
          url: "/?view=today",
        },
  );

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        payload,
      );
      sent += 1;
    } catch (err) {
      failed += 1;
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? Number((err as { statusCode: number }).statusCode)
          : 0;
      // Gone / expired — drop the row.
      if (status === 404 || status === 410) {
        await admin
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", row.endpoint);
      }
    }
  }

  return Response.json({ ok: true, sent, failed, weekly });
}
