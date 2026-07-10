import { safeFetch } from "@/lib/net";
import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Nano Banana" — Gemini's image generation/editing model.
const MODEL = "gemini-2.5-flash-image";

interface InlineImage {
  mimeType: string;
  data: string;
}

/** Turn a data: URL or a remote image URL into base64 for the Gemini request. */
async function toBase64(src: string): Promise<InlineImage | null> {
  if (src.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(src);
    return m ? { mimeType: m[1], data: m[2] } : null;
  }
  try {
    const res = await safeFetch(src);
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

function extractImage(data: unknown): string | null {
  const parts = (
    data as {
      candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>;
    }
  )?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    const inline = (p.inlineData ?? p.inline_data) as
      | { data?: string; mimeType?: string; mime_type?: string }
      | undefined;
    if (inline?.data) {
      const mime = inline.mimeType ?? inline.mime_type ?? "image/png";
      return `data:${mime};base64,${inline.data}`;
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
    return Response.json(
      { error: "Try-on isn't configured yet (missing GEMINI_API_KEY)." },
      { status: 500 },
    );
  }

  let body: {
    personImage?: string | null;
    garments?: Array<{ image: string; label?: string }>;
    garmentImages?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const garmentInputs: Array<{ image: string; label?: string }> =
    body.garments ?? (body.garmentImages ?? []).map((image) => ({ image }));
  const person = body.personImage ? await toBase64(body.personImage) : null;
  const garments: Array<InlineImage & { label?: string }> = [];
  for (const g of garmentInputs.slice(0, 8)) {
    const b = await toBase64(g.image);
    if (b) garments.push({ ...b, label: g.label });
  }

  if (garments.length === 0) {
    return Response.json(
      { error: "No usable garment images in this outfit." },
      { status: 400 },
    );
  }

  const identity = person
    ? "The FIRST image is a photo of a real person. Produce a full-body studio photograph of THAT SAME person — keep their exact face, hairstyle, skin tone, eye colour and body completely unchanged. Do not change their identity or facial features, and do not copy the face of any model shown in the clothing photos."
    : "Produce a realistic full-body studio photograph of a model.";

  const prompt =
    identity +
    " The person must wear ALL of the clothing and accessory items provided below, together, as one coordinated well-fitted outfit. Each item has its own image and is labeled with its type and colour. Reproduce every item faithfully — the same colour, pattern, material and garment type as its photo — and place each in its correct position: tops on the torso, bottoms on the legs, shoes on the feet, outerwear layered over tops, and bags/jewellery worn naturally. Do not change any item's type or colour, and do not add or remove garments. Reproduce each garment's exact pattern, print and texture — do not invent patterns or logos. Keep both hands empty and relaxed at the sides; do not add any props, phones, bags, hats, jewellery or accessories that are not among the provided items. Plain light-grey studio background, soft even lighting, photorealistic, front-facing, standing, full body from head to shoes.";

  const parts: Array<
    { text: string } | { inline_data: { mime_type: string; data: string } }
  > = [{ text: prompt }];
  if (person) {
    parts.push({ text: "Reference person — keep this exact identity:" });
    parts.push({ inline_data: { mime_type: person.mimeType, data: person.data } });
  }
  garments.forEach((g, i) => {
    parts.push({
      text: `Clothing item ${i + 1}${g.label ? ` — ${g.label}` : ""}:`,
    });
    parts.push({ inline_data: { mime_type: g.mimeType, data: g.data } });
  });

  let resp: Response;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts }] }),
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
    return Response.json(
      { error: "The model didn't return an image. Try again." },
      { status: 502 },
    );
  }
  return Response.json({ image });
}
