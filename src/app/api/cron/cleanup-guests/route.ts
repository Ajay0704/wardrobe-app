import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AJA-290 · Retention for abandoned guest sessions. Guest-first onboarding mints an anonymous
 * Supabase user on the signed-out surface; most never convert. This deletes anonymous users older
 * than TTL_HOURS that never got an email, along with their Storage objects and wardrobe snapshot —
 * the accumulation-bound half of the anon abuse defense (rate limiting is the burst half).
 *
 * Protect with $CRON_SECRET (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`). Supports a
 * read-only `?dry=1` that reports how many WOULD be deleted without touching anything.
 */
const TTL_HOURS = 48;
const BUCKETS = ["wardrobe-images", "renders-private"] as const;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (auth !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  if (!admin) return Response.json({ error: "Service role not configured" }, { status: 503 });

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const cutoff = Date.now() - TTL_HOURS * 3_600_000;

  // Collect anonymous, never-converted, aged-out users.
  const victims: string[] = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const users = data?.users ?? [];
    for (const u of users) {
      const isAnon = (u as { is_anonymous?: boolean }).is_anonymous === true || !u.email;
      if (isAnon && !u.email && new Date(u.created_at).getTime() < cutoff) victims.push(u.id);
    }
    if (users.length < 200) break;
  }

  if (dry) return Response.json({ ok: true, dryRun: true, wouldDelete: victims.length });

  let deleted = 0;
  const errors: string[] = [];
  for (const id of victims) {
    // Storage is never cascaded by deleteUser, so clear each bucket's per-user folder first.
    for (const bucket of BUCKETS) {
      try {
        const { data: files } = await admin.storage.from(bucket).list(id);
        const paths = (files ?? []).map((f) => `${id}/${f.name}`);
        if (paths.length) await admin.storage.from(bucket).remove(paths);
      } catch {
        /* best-effort; a missing folder is fine */
      }
    }
    try {
      await admin.from("wardrobe_snapshots").delete().eq("user_id", id);
    } catch {
      /* may cascade from deleteUser anyway */
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) errors.push(`${id}: ${error.message}`);
    else deleted++;
  }

  return Response.json({ ok: true, scanned: victims.length, deleted, errors: errors.slice(0, 10) });
}
