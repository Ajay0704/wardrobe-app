/**
 * Beautify (AJA-120): generative product-shot redraw. Sends a garment cutout to Gemini's image
 * model (image-to-image) and returns a clean front-facing flat-lay on white — occluded regions
 * filled, real colour/pattern/logo preserved. Manual-only (the client calls this on a button tap).
 *
 * Mirrors /api/tryon's Gemini plumbing + /api/cutout's I/O (auth 401, 501 when the key is missing,
 * safeFetch for remote URLs, binary PNG out so the client re-hosts via resolveImageSource).
 */
import { requireUser } from "@/lib/auth-server";
import { safeFetch } from "@/lib/net";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Nano Banana" — Gemini's image generation/editing model (same as /api/tryon).
const MODEL = "gemini-2.5-flash-image";

const PROMPT =
  "You are given a single garment on a plain/transparent background. Redraw it as a clean, " +
  "front-facing e-commerce flat-lay product photograph on a pure white background. Complete any " +
  "occluded, folded, wrinkled or missing regions so the ENTIRE garment is visible, symmetric and " +
  "neatly presented (as if laid flat or on an invisible mannequin). Preserve the garment's EXACT " +
  "colour, fabric texture, pattern/print and any logos or text exactly as shown — do not invent, " +
  "move or alter logos, colours or patterns. Output ONLY the single garment, centred, no person, " +
  "no hands, no mannequin, no props; pure white background with a soft natural shadow.";

/** Pull the first inline image (base64) from a Gemini generateContent response. */
function extractImage(data: unknown): string | null {
  const parts = (
    data as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> }
  )?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    const inline = (p.inlineData ?? p.inline_data) as { data?: string } | undefined;
    if (inline?.data) return inline.data;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ error: "Beautify isn't configured (missing GEMINI_API_KEY)." }, { status: 501 });
  }

  let body: { imageUrl?: string; imageData?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Source cutout → base64 + mime.
  let srcBuf: Buffer;
  let srcMime = "image/png";
  try {
    if (body.imageData?.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(body.imageData);
      if (!m) return Response.json({ error: "Invalid imageData." }, { status: 400 });
      srcMime = m[1];
      srcBuf = Buffer.from(m[2], "base64");
    } else if (body.imageUrl) {
      const res = await safeFetch(body.imageUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return Response.json({ error: "Could not load image." }, { status: 502 });
      srcMime = res.headers.get("content-type") || "image/png";
      srcBuf = Buffer.from(await res.arrayBuffer());
    } else {
      return Response.json({ error: "imageUrl or imageData required." }, { status: 400 });
    }
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json({ error: `Image fetch failed: ${msg}` }, {
      status: msg.startsWith("blocked") ? 400 : 502,
    });
  }

  const parts = [
    { text: PROMPT },
    { inline_data: { mime_type: srcMime, data: srcBuf.toString("base64") } },
  ];

  let resp: Response;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: AbortSignal.timeout(45000),
      },
    );
  } catch {
    return Response.json({ error: "Couldn't reach the image service." }, { status: 502 });
  }

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 400);
    return Response.json({ error: `Image service error (${resp.status}).`, detail }, { status: 502 });
  }

  const b64 = extractImage(await resp.json());
  if (!b64) {
    return Response.json({ error: "The model didn't return an image. Try again." }, { status: 502 });
  }

  // Normalize to PNG so the client always gets a consistent format.
  let png: Buffer;
  try {
    png = await sharp(Buffer.from(b64, "base64")).png().toBuffer();
  } catch {
    return Response.json({ error: "Beautify output was unreadable." }, { status: 500 });
  }

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
