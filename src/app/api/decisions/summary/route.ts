/**
 * Savings bank (AJA-190). Aggregates the caller's `decision` events into the
 * numbers the copilot reflects back: money kept on skips, buys that will earn
 * their place (wear-tracked), and the recent decision list. Read via the admin
 * client (service role) scoped to the authenticated user — no RLS read policy or
 * snapshot changes needed.
 */
import { requireUser } from "@/lib/auth-server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EMPTY = { savedTotal: 0, skippedCount: 0, boughtCount: 0, waitCount: 0, recent: [] };

export async function GET(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user || user.id === "local-dev") return Response.json(EMPTY);
  const admin = adminClient();
  if (!admin) return Response.json(EMPTY);

  const { data } = await admin
    .from("events")
    .select("payload, created_at")
    .eq("user_id", user.id)
    .eq("type", "decision")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as { payload: Record<string, unknown> | null; created_at: string }[];
  let savedTotal = 0;
  let skippedCount = 0;
  let boughtCount = 0;
  let waitCount = 0;
  const recent: {
    itemName: string;
    outcome: string;
    price: number | null;
    createdAt: string;
  }[] = [];

  for (const r of rows) {
    const p = r.payload ?? {};
    const outcome = p.outcome as string | undefined;
    const price = typeof p.price === "number" ? (p.price as number) : null;
    if (outcome === "skipped") {
      skippedCount++;
      if (price) savedTotal += price;
    } else if (outcome === "bought") {
      boughtCount++;
    } else if (outcome === "wait") {
      waitCount++;
    }
    if (recent.length < 8) {
      recent.push({
        itemName: (p.itemName as string) ?? "Item",
        outcome: outcome ?? "wait",
        price,
        createdAt: r.created_at,
      });
    }
  }

  return Response.json({ savedTotal, skippedCount, boughtCount, waitCount, recent });
}
