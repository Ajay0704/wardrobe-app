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
    const res = await fetch(src);
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
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Try-on isn't configured yet (missing GEMINI_API_KEY)." },
      { status: 500 },
    );
  }

  let body: { personImage?: string | null; garmentImages?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const person = body.personImage ? await toBase64(body.personImage) : null;
  const garments = (
    await Promise.all((body.garmentImages ?? []).slice(0, 6).map(toBase64))
  ).filter((g): g is InlineImage => g !== null);

  if (garments.length === 0) {
    return Response.json(
      { error: "No usable garment images in this outfit." },
      { status: 400 },
    );
  }

  const prompt = person
    ? "Generate one realistic full-body fashion photo of the PERSON in the first image wearing ALL the clothing items from the other images together as a single coordinated outfit. Keep the person's face, skin tone, and body. Clean neutral studio background, natural lighting."
    : "Generate one realistic full-body fashion photo of a model wearing ALL the clothing items shown together as a single coordinated outfit. Clean neutral studio background, natural lighting.";

  const parts: Array<
    { text: string } | { inline_data: { mime_type: string; data: string } }
  > = [{ text: prompt }];
  if (person)
    parts.push({ inline_data: { mime_type: person.mimeType, data: person.data } });
  for (const g of garments)
    parts.push({ inline_data: { mime_type: g.mimeType, data: g.data } });

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
