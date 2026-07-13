import { requireUser } from "@/lib/auth-server";
import { runMatch } from "@/lib/shop-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { detectionId, cursor, limit } = await request.json().catch(() => ({}));
  if (!detectionId) return Response.json({ error: "detectionId required." }, { status: 400 });
  const r = await runMatch(
    "match_complements",
    detectionId,
    cursor ?? null,
    Math.min(Math.max(Number(limit) || 10, 1), 30),
    "goes-with",
  );
  if (r.error) return Response.json({ error: r.error }, { status: 500 });
  return Response.json({ items: r.items, nextCursor: r.nextCursor });
}
