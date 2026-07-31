import { safeFetch } from "@/lib/net";
import { requireUser } from "@/lib/auth-server";
import type { TryOnScene } from "@/lib/tryon";
import { buildTryOnPrompt } from "@/lib/tryon-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AJA-274 — on-body try-on.
 *
 * MODEL: `gemini-2.5-flash-image` was measured to IGNORE the person reference
 * entirely and render a stock model; so was `gemini-3.1-flash-image`. Only
 * `gemini-3-pro-image` preserves identity. That is why the model is pinned here and
 * not configurable down to a cheaper tier — the cheap tiers do not do the job at all.
 *
 * WHY NOT REPLICATE: this first shipped against `google/nano-banana-pro` on Replicate,
 * chiefly because `aspect_ratio` is a real parameter there and prose framing had
 * produced non-deterministic geometry (a 1024x1024 square with the old prompt, 896x1200
 * with an explicit instruction). Two things then settled it the other way:
 *   1. Production's REPLICATE_API_TOKEN is empty, so the route 501'd on device. The
 *      only other consumer, /api/segment-outfit, silently falls back to Gemini
 *      detection, which is why nobody had noticed.
 *   2. Gemini has its own `imageConfig.aspectRatio`, which is just as much a real
 *      parameter — 9 of 9 test renders came back exactly 896x1200 through it.
 * So the reason for the detour disappeared. Replicate also cost 23-50s against
 * Gemini's 19-23s. The one thing given up is a separate billing balance: a try-on
 * spike now shares quota with beautify, analyze and chat.
 */
const MODEL = "gemini-3-pro-image";

/**
 * 1K, not 2K. 2K measured 40-55s against maxDuration=60 — no headroom. And it is not
 * a cost saving: both emit 1120 output image tokens, confirmed from a real
 * usageMetadata response, so ~$0.134/render either way. 1K buys latency only.
 */
const IMAGE_SIZE = "1K";

/** Leave the platform room to return a real error instead of being killed mid-flight. */
const RENDER_TIMEOUT_MS = 45_000;

interface InlineImage {
  mimeType: string;
  data: string;
}

/** Turn a data: URL or a remote image URL into base64 for an inline_data part. */
async function toBase64(src: string): Promise<InlineImage | null> {
  if (src.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(src);
    return m ? { mimeType: m[1], data: m[2] } : null;
  }
  try {
    // Every sibling route passes a signal; without one a single slow garment URL
    // could consume the whole 60s budget before the render even started.
    const res = await safeFetch(src, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      mimeType: res.headers.get("content-type") || "image/jpeg",
      data: buf.toString("base64"),
    };
  } catch {
    return null;
  }
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

const part = (i: InlineImage): Part => ({
  inline_data: { mime_type: i.mimeType, data: i.data },
});

function extractImage(data: unknown): InlineImage | null {
  const parts = (
    data as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> }
  )?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    const inline = (p.inlineData ?? p.inline_data) as
      | { data?: string; mimeType?: string; mime_type?: string }
      | undefined;
    if (inline?.data) {
      return { mimeType: inline.mimeType ?? inline.mime_type ?? "image/png", data: inline.data };
    }
  }
  return null;
}

export async function POST(request: Request) {
  if (!(await requireUser(request))) {
    return Response.json({ error: "Please sign in to use this." }, { status: 401 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // 501, matching /api/beautify and /api/cutout, so the client can tell "not
    // configured" apart from "transient failure" and stop offering a dead retry.
    return Response.json(
      { error: "Try-on isn't configured yet (missing GEMINI_API_KEY)." },
      { status: 501 },
    );
  }

  let body: {
    personImage?: string | null;
    faceImage?: string | null;
    scene?: TryOnScene;
    garments?: Array<{ image: string; label?: string }>;
    garmentImages?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // `garmentImages` is the legacy string-array shape; keep accepting it.
  const garmentInputs: Array<{ image: string; label?: string }> =
    body.garments ?? (body.garmentImages ?? []).map((image) => ({ image }));
  if (garmentInputs.length === 0) {
    return Response.json({ error: "No usable garment images in this outfit." }, { status: 400 });
  }

  /**
   * Capped at 6 (down from 8). With two person references that is already 8 images,
   * and the reference guidance is explicit that past ~6 the extras start competing
   * for control of the result. Real outfits are 3-5 items, so this clips almost nothing.
   */
  const garments: Array<InlineImage & { label?: string }> = [];
  for (const g of garmentInputs.slice(0, 6)) {
    const b = await toBase64(g.image);
    if (b) garments.push({ ...b, label: g.label });
  }
  if (garments.length === 0) {
    return Response.json({ error: "No usable garment images in this outfit." }, { status: 400 });
  }

  const person = body.personImage ? await toBase64(body.personImage) : null;
  const face = person && body.faceImage ? await toBase64(body.faceImage) : null;

  const prompt = buildTryOnPrompt({
    hasFace: Boolean(face),
    hasPerson: Boolean(person),
    garments: garments.map((g) => ({ label: g.label })),
    scene: body.scene,
  });

  // Order is load-bearing: the prompt's image manifest names these by index, and
  // buildTryOnPrompt derives that numbering from the same two flags used here.
  const parts: Part[] = [{ text: prompt }];
  if (face) parts.push(part(face));
  if (person) parts.push(part(person));
  for (const g of garments) parts.push(part(g));

  let resp: Response;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts }],
          // A real parameter, not a request in prose — this is what makes the 3:4
          // container in TryOnView a guarantee instead of a hope.
          generationConfig: { imageConfig: { aspectRatio: "3:4", imageSize: IMAGE_SIZE } },
        }),
        signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
      },
    );
  } catch {
    return Response.json({ error: "Couldn't reach the image service." }, { status: 502 });
  }

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 400);
    return Response.json(
      { error: `Image service error (${resp.status}).`, detail },
      { status: 502 },
    );
  }

  const image = extractImage(await resp.json());
  if (!image) {
    return Response.json({ error: "The model didn't return an image. Try again." }, { status: 502 });
  }
  // A data URL, so the contract with lib/tryon.ts stays "a string usable as <img src>".
  // ~300-500KB at 1K. Anything that later SAVES a render must re-host it through
  // resolveImageSource rather than persisting this string — see heal.ts's inline limit.
  return Response.json({ image: `data:${image.mimeType};base64,${image.data}` });
}
