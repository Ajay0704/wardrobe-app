import { safeFetch } from "@/lib/net";
import { requireUser } from "@/lib/auth-server";
import type { TryOnScene } from "@/lib/tryon";
import { buildTryOnPrompt } from "@/lib/tryon-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AJA-274 — on-body try-on, via Replicate rather than the Gemini API directly.
 *
 * Four reasons, only one of which is billing:
 *  1. `aspect_ratio` is a real parameter here. Asking for 3:4 in prose gave a square
 *     1024x1024 render with the old prompt and 896x1200 with an explicit framing
 *     instruction — non-deterministic geometry, which the UI then cropped.
 *  2. Separate billing balance from the Gemini key shared by analyze/beautify/chat,
 *     so the most expensive call in the app can't starve closet tagging.
 *  3. The pattern is already proven in /api/segment-outfit.
 *  4. It lets this route return 501 for "not configured" like beautify and cutout,
 *     so the client can disable the affordance instead of offering a dead retry.
 *
 * `gemini-2.5-flash-image` was measured to IGNORE the person reference entirely and
 * render a stock model; nano-banana-pro (gemini-3-pro-image) preserves identity.
 * That is why the model id is not configurable down to a cheaper tier.
 */
const MODEL_VERSION = "93f55bfdbdfd4a62e16bf861729bcfa9e8fd9b0325fb218cbc4dd138ecc87cc7";

/** 2K measured 40-55s against maxDuration=60 — no headroom. 1K is plenty on a phone. */
const RESOLUTION = "1K";

/** Leave the platform room to return a real error instead of being killed mid-flight. */
const RENDER_TIMEOUT_MS = 45_000;

interface InlineImage {
  mimeType: string;
  data: string;
}

/** Turn a data: URL or a remote image URL into base64. */
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

const asDataUrl = (i: InlineImage) => `data:${i.mimeType};base64,${i.data}`;

// ---------------------------------------------------------------- replicate

async function render(
  input: Record<string, unknown>,
  token: string,
): Promise<{ url?: string; error?: string; status?: number }> {
  let resp: Response;
  try {
    resp = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        // Block for up to ~60s server-side instead of polling from the start.
        Prefer: "wait",
      },
      body: JSON.stringify({ version: MODEL_VERSION, input }),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
  } catch {
    return { error: "Couldn't reach the image service.", status: 502 };
  }
  if (!resp.ok) {
    return {
      error: `Image service error (${resp.status}).`,
      status: 502,
    };
  }

  let pred = (await resp.json()) as {
    status?: string;
    output?: string | string[];
    error?: unknown;
    urls?: { get?: string };
  };
  // `Prefer: wait` usually returns a finished prediction, but a cold start can come
  // back still processing — same belt-and-braces poll as /api/segment-outfit.
  for (let i = 0; i < 8 && pred.status && !["succeeded", "failed", "canceled"].includes(pred.status); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    if (!pred.urls?.get) break;
    try {
      const again = await fetch(pred.urls.get, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!again.ok) break;
      pred = await again.json();
    } catch {
      break;
    }
  }

  if (pred.status !== "succeeded") {
    return {
      error: String(pred.error ?? "").slice(0, 200) || "The render didn't finish. Try again.",
      status: 502,
    };
  }
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  return out ? { url: out } : { error: "The model didn't return an image. Try again.", status: 502 };
}

// ---------------------------------------------------------------- handler

export async function POST(request: Request) {
  if (!(await requireUser(request))) {
    return Response.json({ error: "Please sign in to use this." }, { status: 401 });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    // 501, matching /api/beautify and /api/segment-outfit, so the client can tell
    // "not configured" apart from "transient failure" and stop offering a retry.
    return Response.json(
      { error: "Try-on isn't configured yet (missing REPLICATE_API_TOKEN)." },
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
   * Replicate's `image_input` is a flat array with nowhere to attach per-image
   * labels, so order is load-bearing and the prompt has to name it. Cap at 6
   * (down from 8): with 2 person references that is 8 images, and the reference
   * guidance is explicit that past ~6 the extra images compete for control. Real
   * outfits are 3-5 items, so this clips almost nothing.
   */
  const garments: Array<{ src: string; label?: string }> = [];
  for (const g of garmentInputs.slice(0, 6)) {
    // Remote URLs are passed straight through — Replicate fetches them itself, which
    // makes the request smaller than inlining every garment as base64 did.
    if (/^https?:\/\//i.test(g.image)) {
      garments.push({ src: g.image, label: g.label });
      continue;
    }
    const b = await toBase64(g.image);
    if (b) garments.push({ src: asDataUrl(b), label: g.label });
  }
  if (garments.length === 0) {
    return Response.json({ error: "No usable garment images in this outfit." }, { status: 400 });
  }

  const person = body.personImage ? await toBase64(body.personImage) : null;
  const face = person && body.faceImage ? await toBase64(body.faceImage) : null;

  const people: string[] = [];
  if (face) people.push(asDataUrl(face));
  if (person) people.push(asDataUrl(person));

  const prompt = buildTryOnPrompt({
    hasFace: Boolean(face),
    hasPerson: Boolean(person),
    garments: garments.map((g) => ({ label: g.label })),
    scene: body.scene,
  });

  const result = await render(
    {
      prompt,
      image_input: [...people, ...garments.map((g) => g.src)],
      aspect_ratio: "3:4",
      resolution: RESOLUTION,
      output_format: "jpg",
    },
    token,
  );

  if (!result.url) {
    return Response.json({ error: result.error }, { status: result.status ?? 502 });
  }
  // A Replicate output URL, not inline bytes — keeps the response tiny. The contract
  // with lib/tryon.ts is "a string usable as <img src>", which this satisfies. Note
  // these URLs expire (~1h), so anything that later SAVES a render must re-host it
  // through resolveImageSource first.
  return Response.json({ image: result.url });
}
