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
import type { Category } from "@/lib/types";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Nano Banana" — Gemini's image generation/editing model (same as /api/tryon).
const MODEL = "gemini-2.5-flash-image";

// Per-category framing enforced by the prompt; the deterministic sharp pass below then pins the
// exact canvas size, item scale and centring regardless of Gemini's shot. Each category prompt is a
// LEAD (how to frame this specific kind of item) + the SHARED guardrail (anti-drift + white bg,
// gender-neutral). This replaces the old binary garment/product split, which mis-framed bottoms
// (3-D with belts), jacket collars (horns) and shoes (random angles).

// Appended to EVERY category prompt: preserves the item exactly and pins the flat-white output.
const SHARED =
  "Preserve the item's EXACT colour, fabric and material texture, pattern or print, and ALL logos, " +
  "text and hardware, exactly as shown — do not invent, add, move, recolour or restyle anything " +
  "(aside from removing the worn-on items, props and background explicitly noted above), and never " +
  "change its TYPE, cut or silhouette (sleeve or leg length, neckline, collar and hem must match the " +
  "input; a long-sleeve sweater stays a long-sleeve sweater). Output ONLY this one item, centred " +
  "with even margins, on a pure flat white (#ffffff) background with NO shadow, reflection, card, " +
  "surface or backdrop of any kind. These instructions apply identically whether the item is men's, " +
  "women's or unisex. If the input is not a single clear item of this kind, reproduce what is shown " +
  "as faithfully as possible rather than inventing something new.";

const LEAD: Record<Category, string> = {
  top:
    "You are given a single top (t-shirt, shirt, blouse, sweater, jersey or knit). Render it as a " +
    "professional GHOST-MANNEQUIN (invisible-mannequin) e-commerce product photograph: shown as if " +
    "worn by an invisible person, with a natural shoulder line, realistic three-dimensional volume " +
    "and fabric drape, and sleeves hanging straight down close alongside the body. Front-facing, " +
    "straight-on and bilaterally SYMMETRICAL — the left and right of the neckline, collar and hem " +
    "must mirror each other evenly, with NO lopsided, pinched or distorted neck opening. Render the " +
    "neckline and collar naturally and faithfully as in the input (crew, V, polo or button collar), " +
    "lying as it naturally would, neither flared open nor gaping. Complete any occluded or folded " +
    "regions so the ENTIRE top is visible. The neck opening must be HOLLOW and EMPTY — show the plain " +
    "white background through it, as if an invisible wearer vanished; render absolutely NO neck, bust, " +
    "torso, shoulders, mannequin or dress-form of any colour (no cream, grey or skin-toned form), only " +
    "the garment's own fabric. Show no visible person, body parts, hanger or props.",
  dress:
    "You are given a single dress. Render it as a professional GHOST-MANNEQUIN (invisible-mannequin) " +
    "e-commerce product photograph: shown as if worn by an invisible person, with a natural shoulder " +
    "line, realistic volume and drape through the bodice and skirt, and any sleeves hanging straight " +
    "down alongside the body. Front-facing, straight-on and bilaterally SYMMETRICAL — neckline, " +
    "waist and hem mirror evenly. Render the neckline, straps and hemline naturally and faithfully " +
    "as in the input. Complete any occluded or folded regions so the ENTIRE dress is visible. The neck " +
    "opening must be HOLLOW and EMPTY — show the plain white background through it; render absolutely " +
    "NO neck, bust, torso, shoulders, mannequin or dress-form of any colour (no cream, grey or " +
    "skin-toned form), only the garment's own fabric. Show no visible person, body parts, hanger or " +
    "props.",
  outerwear:
    "You are given a single piece of outerwear (jacket, coat, blazer or hoodie). Render it as a " +
    "professional GHOST-MANNEQUIN (invisible-mannequin) e-commerce product photograph: shown as if " +
    "worn by an invisible person, with a natural shoulder line, realistic volume and drape, and " +
    "sleeves hanging straight down alongside the body. Front-facing, straight-on and bilaterally " +
    "SYMMETRICAL. Render the collar and lapels EXACTLY as they sit in the input — lying flat and " +
    "folded down FLAT against the shoulders, pressed DOWN with its points resting on the garment's own " +
    "fabric — lying as low as a shirt collar folded shut on a table. Do NOT stand the collar up, raise " +
    "it, flare it outward, or add pointed 'horns', wings or peaks that are not in the input. Keep the " +
    "front closure faithful: show the zipper, buttons or placket exactly as in the input, closed or " +
    "open to match. Complete any occluded or folded regions so the ENTIRE garment is visible. The neck " +
    "opening must be HOLLOW and EMPTY, showing the plain white background through it; render NO neck, " +
    "bust, torso, mannequin or dress-form of any colour, only the garment's own fabric. Show no " +
    "visible person, body parts, hanger or props.",
  bottom:
    "You are given a single pair of bottoms (trousers, jeans, shorts or a skirt). Render it as a " +
    "professional FLAT-LAY e-commerce product photograph, photographed straight from directly ABOVE " +
    "as if laid flat on a surface — completely flat and two-dimensional, with NO body, NO legs, NO " +
    "mannequin and NO 3D stuffing or volume. Lay it out neatly front-side up: waistband straight and " +
    "flat across the top, both legs extended straight DOWNWARD, parallel and of equal length (for a " +
    "skirt, hem spread evenly). REMOVE and do not render any belt, suspenders, braces, chain, hanger " +
    "or accessory threaded through or resting on the waistband — show the bare garment only, with " +
    "empty belt loops. Bilaterally symmetrical. Complete any occluded or folded regions so the " +
    "ENTIRE garment is visible.",
  shoes:
    "You are given footwear (a single shoe or a pair). Render it as a clean, professional e-commerce " +
    "PRODUCT photograph shot from a consistent straight-on SIDE PROFILE — the outer side facing the " +
    "camera, toe pointing to the same side, sitting level as if on an invisible flat surface. If the " +
    "input clearly shows a pair, present a tidy matched pair in the same side-profile orientation, " +
    "neatly aligned; otherwise show the single shoe. Render exactly ONE clean instance of every part " +
    "— one sole, one upper, one set of laces — with NO floating, duplicated, detached or extra " +
    "soles, straps or parts, and no mangled or warped geometry. Complete any occluded or cut-off " +
    "parts so the ENTIRE shoe is visible and correctly proportioned. Show no foot, leg, hand, box, " +
    "stand or props.",
  bag:
    "You are given a single bag (handbag, tote, backpack, clutch or purse). Render it as a clean, " +
    "professional e-commerce PRODUCT photograph, shown straight-on from the front at a natural, " +
    "upright angle, standing as it naturally would. Render straps and handles faithfully and " +
    "symmetrically as in the input, without tangling or duplicating them. Complete any occluded or " +
    "cut-off parts so the ENTIRE bag is visible. Show no hand, arm, body part, mannequin, stand, " +
    "hook or props.",
  accessory:
    "You are given a single accessory — for example a belt, watch, hat, scarf, sunglasses or " +
    "jewellery. Render it as a clean, professional e-commerce PRODUCT photograph: the object by " +
    "itself, straight-on at a natural, flattering angle, complete and fully visible. You MUST remove " +
    "any hand, fingers, wrist, arm, neck, head, skin, body part, mannequin, bust, stand, hook, table " +
    "or prop it was worn on or photographed against — show the bare product only. For a belt, lay it " +
    "out cleanly (coiled neatly or straight), not on a body. Complete any occluded or cut-off parts " +
    "so the ENTIRE object is visible.",
};

const PROMPTS = Object.fromEntries(
  (Object.keys(LEAD) as Category[]).map((c) => [c, `${LEAD[c]} ${SHARED}`]),
) as Record<Category, string>;

const promptFor = (category?: string): string => PROMPTS[category as Category] ?? PROMPTS.top;

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

  let body: { imageUrl?: string; imageData?: string; category?: string };
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
    { text: promptFor(body.category) },
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
