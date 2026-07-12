import { runIngest } from "@/lib/feed/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron: refresh the Explore product feed from configured providers
 * (eBay now; Skimlinks once approved). Protect with Authorization: Bearer
 * $CRON_SECRET (Vercel sets this automatically when CRON_SECRET is configured).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runIngest();
  return Response.json({ ok: result.errors.length === 0, ...result });
}
