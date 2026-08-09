import webpush from "web-push";
import { adminClient } from "@/lib/supabase/admin";
import { pickAgingNudge, AGING_DEFAULTS, type AgingCandidate } from "@/lib/aging-wishlist";
import type { WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AJA-286 · Ageing-wishlist nudge. The cheapest test of the "manufacture the temptation
 * window" hypothesis: instead of waiting for the user to tab over from Safari, find the
 * pieces they saved ~30 days ago and never decided on, and send one closet-led reminder.
 *
 * Reads each user's wardrobe from the `wardrobe_snapshots` blob (service role, bypasses RLS),
 * skips anything already resolved in the Decision bank (`events.type='decision'`), and picks
 * one candidate per user via `pickAgingNudge`. Delivery is deliberately additive — web-push
 * today, iOS/APNs to follow — and every send logs a `nudge_sent` event so the kill metric
 * (≥25% of nudges → a logged verdict within 24h) can be measured.
 *
 * Guarded by `Authorization: Bearer $CRON_SECRET`. `?dry=1` computes candidates and reports
 * counts WITHOUT sending or writing anything — the "hand-send the first 20" first look.
 */
const COOLDOWN_DAYS = 14; // never nudge the same person more than ~once a fortnight

interface Candidate {
  userId: string;
  cand: AgingCandidate;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (auth !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  if (!admin) return Response.json({ error: "Service role not configured" }, { status: 503 });

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const now = Date.now();
  const cooldownCutoff = now - COOLDOWN_DAYS * 86_400_000;

  // One row per user; the wishlist AND owned items (for the "you already own N" check) are both
  // in `items`, so no join is needed. Not indexable by item age — a blob scan, fine at this scale.
  const { data: snaps, error } = await admin
    .from("wardrobe_snapshots")
    .select("user_id, items");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const chosen: Candidate[] = [];
  let scanned = 0;

  for (const row of snaps ?? []) {
    const userId = (row as { user_id?: string }).user_id;
    const items = (row as { items?: WardrobeItem[] }).items;
    if (!userId || !Array.isArray(items)) continue;
    scanned++;

    // Everything this user has already decided — never re-ask.
    const { data: decisions } = await admin
      .from("events")
      .select("payload")
      .eq("user_id", userId)
      .eq("type", "decision")
      .limit(2000);
    const decidedRefs = new Set<string>();
    for (const d of decisions ?? []) {
      const ref = (d as { payload?: { itemRef?: string } }).payload?.itemRef;
      if (ref) decidedRefs.add(ref);
    }

    const cand = pickAgingNudge(items, decidedRefs, now, AGING_DEFAULTS);
    if (!cand) continue;

    // Fatigue guardrail: skip if we nudged this user within the cooldown.
    const { data: lastNudge } = await admin
      .from("events")
      .select("created_at")
      .eq("user_id", userId)
      .eq("type", "nudge_sent")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastAt = lastNudge?.[0] ? new Date((lastNudge[0] as { created_at: string }).created_at).getTime() : 0;
    if (lastAt > cooldownCutoff) continue;

    chosen.push({ userId, cand });
  }

  if (dry) {
    return Response.json({
      ok: true,
      dryRun: true,
      scanned,
      candidates: chosen.length,
      sample: chosen.slice(0, 10).map((c) => ({
        userId: c.userId.slice(0, 8),
        item: c.cand.item.name,
        ageDays: c.cand.ageDays,
        redundantCount: c.cand.redundantCount,
        title: c.cand.title,
        body: c.cand.body,
      })),
    });
  }

  // --- Real send. Web-push now; iOS/APNs added alongside (same computed payload). ---
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidReady = Boolean(vapidPublic && vapidPrivate);
  if (vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@example.com", vapidPublic!, vapidPrivate!);
  }

  let nudged = 0;
  let sentWeb = 0;
  for (const { userId, cand } of chosen) {
    const payload = JSON.stringify({
      title: cand.title,
      body: cand.body,
      // TODO(delivery): confirm this opens the item's Smart-Buy verdict so the tap can log a
      // buy/wait/skip (the kill-metric loop). Placeholder until the deep-link is wired.
      url: `/?view=wishlist&item=${cand.item.id}`,
    });

    const web = vapidReady ? await sendWebPush(admin, userId, payload) : 0;
    sentWeb += web;

    // Instrument even if delivery was a no-op — the denominator of the kill metric is "nudges
    // we decided to send", and we only mark a person nudged once per run (the cooldown anchor).
    await admin.from("events").insert({
      user_id: userId,
      type: "nudge_sent",
      payload: {
        itemRef: cand.item.id,
        itemName: cand.item.name,
        redundantCount: cand.redundantCount,
        ageDays: cand.ageDays,
        channels: { web },
      },
    });
    nudged++;
  }

  return Response.json({ ok: true, scanned, nudged, sentWeb, vapidReady });
}

/** Send one payload to a single user's web-push subscriptions; prune dead endpoints. */
async function sendWebPush(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  userId: string,
  payload: string,
): Promise<number> {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    const sub = s as { endpoint: string; p256dh: string; auth: string };
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err) {
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? Number((err as { statusCode: number }).statusCode)
          : 0;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }
  return sent;
}
