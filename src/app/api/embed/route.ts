import { requireUser } from "@/lib/auth-server";
import { checkLimit, tooMany } from "@/lib/rate-limit";
import { embedImages, loadImageBytes, parseEmbedItems, prepImage } from "@/lib/visual-embed-server";
import { quantizeVector } from "@/lib/visual-similarity";

/**
 * AJA-301 — image vectors for Should-I-Buy's "you own something very similar".
 *
 * POST { items: [{ id, src }] } (1–16; src an https URL or inline image)
 *   → { results: [{ id, vector }] }, vector = base64 int8 × 768, or null for any image
 *     that couldn't be fetched, decoded or embedded.
 *
 * Nothing is stored server-side: the client keeps vectors in a device-local index
 * (src/lib/visual-index.ts), so the synced wardrobe snapshot never grows.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return Response.json({ error: "Please sign in to use this." }, { status: 401 });
  }
  const rl = await checkLimit(user, "embed");
  if (!rl.ok) return tooMany(rl);

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // 501, like try-on and beautify: the client turns the feature off for the session.
    return Response.json({ error: "Visual matching isn't configured." }, { status: 501 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const items = parseEmbedItems(body);
  if (!items) return Response.json({ error: "Invalid request." }, { status: 400 });

  const prepared = await Promise.all(
    items.map(async ({ src }) => {
      const bytes = await loadImageBytes(src);
      return bytes ? prepImage(bytes) : null;
    }),
  );
  const vectors = await embedImages(prepared, key);
  return Response.json({
    results: items.map((it, i) => {
      const v = vectors[i];
      return { id: it.id, vector: v ? quantizeVector(v) : null };
    }),
  });
}
