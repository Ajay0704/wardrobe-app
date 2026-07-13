import { adminClient, removeStoredImage } from "@/lib/import-item";

export const runtime = "nodejs";
export const maxDuration = 60;

const TTL_DAYS = 30;

/**
 * Vercel Cron: retention for un-reviewed import candidates. Marks pending /
 * needs_verification candidates older than TTL_DAYS as dismissed and prunes their
 * captured Storage images so they don't accumulate. Protect with $CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (auth !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  if (!admin) return Response.json({ error: "Not configured" }, { status: 503 });

  const cutoff = new Date(Date.now() - TTL_DAYS * 86_400_000).toISOString();
  const { data: stale } = await admin
    .from("import_candidates")
    .select("id,image_url")
    .in("status", ["pending", "needs_verification"])
    .lt("created_at", cutoff);

  const rows = (stale ?? []) as { id: string; image_url: string | null }[];
  if (!rows.length) return Response.json({ ok: true, cleaned: 0 });

  for (const r of rows) {
    if (r.image_url) await removeStoredImage(admin, r.image_url);
  }
  await admin
    .from("import_candidates")
    .update({ status: "dismissed" })
    .in("id", rows.map((r) => r.id));

  return Response.json({ ok: true, cleaned: rows.length });
}
