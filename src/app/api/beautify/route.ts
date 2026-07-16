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

// Canonical flat-lay framing enforced by the prompt; the deterministic sharp pass below then
// pins the exact canvas size, garment scale and centring regardless of how Gemini framed it.
const PROMPT =
  "You are given a single garment. Redraw it as a clean e-commerce flat-lay product photograph " +
  "with a STRICTLY CANONICAL framing: perfectly centred, front-facing and straight-on (no angle " +
  "or perspective), bilaterally symmetrical, with sleeves/straps in a fixed, natural, consistent " +
  "position (sleeves relaxed and angled slightly outward, hems straight and level). Complete any " +
  "occluded, folded, wrinkled or missing regions so the ENTIRE garment is visible and neatly " +
  "presented, as if laid flat. The garment must fill about 85% of the frame height with even " +
  "margins on all sides. Output a SQUARE 1:1 image on a pure flat white background with NO shadow, " +
  "no person, no hands, no mannequin, no props — only the single garment. Preserve the garment's " +
  "EXACT colour, fabric texture, pattern/print and any logos or text exactly as shown; do not " +
  "invent, move, recolour or restyle anything.";

// Fixed output geometry so every beautified item shares canvas size, garment scale and centring.
const CANVAS = 1000; // square output edge (px)
const FILL = 900; // garment's longest side ≈ 90% of the canvas

/**
 * Deterministic flat-lay normalization. Trims the white border down to the garment's bounding box,
 * scales it so its longest side is FILL px, then centres it on a CANVAS×CANVAS white square with
 * equal padding. Runs on every beautified image so all items share identical framing regardless of
 * Gemini's output. (The client then removes the white → transparent, preserving this geometry.)
 */
async function normalizeFlatLay(input: Buffer): Promise<Buffer> {
  // Flatten onto white (uniform, trimmable border) and normalize EXIF orientation.
  const flat = await sharp(input).rotate().flatten({ background: "#ffffff" }).toBuffer();
  let trimmed = flat;
  try {
    trimmed = await sharp(flat).trim({ background: "#ffffff", threshold: 12 }).toBuffer();
  } catch {
    /* uniform image / nothing to trim — keep the flattened original */
  }
  // fit: "inside" makes the LONGEST side FILL px (enlarging small garments too) and preserves ratio.
  const resized = await sharp(trimmed).resize(FILL, FILL, { fit: "inside" }).toBuffer();
  const { width = FILL, height = FILL } = await sharp(resized).metadata();
  const left = Math.max(0, Math.round((CANVAS - width) / 2));
  const top = Math.max(0, Math.round((CANVAS - height) / 2));
  return sharp({
    create: { width: CANVAS, height: CANVAS, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

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

  // Deterministic flat-lay normalization → fixed canvas, garment scale and centring.
  let png: Buffer;
  try {
    png = await normalizeFlatLay(Buffer.from(b64, "base64"));
  } catch {
    return Response.json({ error: "Beautify output was unreadable." }, { status: 500 });
  }

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
