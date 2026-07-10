import { requireUser } from "@/lib/auth-server";
import { safeFetch } from "@/lib/net";

export const runtime = "nodejs";
export const maxDuration = 30;

// Gemini vision — fast + cheap, ideal for structured item tagging.
const MODEL = "gemini-3.5-flash";
const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"];
const SEASONS = ["spring", "summer", "fall", "winter"];

/** Map whatever word the model returns onto our fixed category set. */
function normalizeCategory(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.toLowerCase().trim();
  if (CATEGORIES.includes(v)) return v;
  if (/(t-?shirt|shirt|blouse|sweater|top|tee|tank|hoodie|cardigan|polo)/.test(v)) return "top";
  if (/(jean|pant|trouser|short|skirt|legging|chino|bottom)/.test(v)) return "bottom";
  if (/(dress|gown|jumpsuit|romper)/.test(v)) return "dress";
  if (/(jacket|coat|blazer|outerwear|parka|overcoat|vest)/.test(v)) return "outerwear";
  if (/(shoe|sneaker|boot|heel|sandal|loafer|trainer|footwear)/.test(v)) return "shoes";
  if (/(bag|purse|tote|backpack|clutch|handbag)/.test(v)) return "bag";
  if (/(hat|scarf|belt|jewel|necklace|ring|watch|glove|sunglass|accessor)/.test(v)) return "accessory";
  return undefined;
}

interface Inline {
  mime_type: string;
  data: string;
}

/** Turn a data: URL or a remote image URL into inline base64 for Gemini. */
async function toInline(src: string): Promise<Inline | null> {
  if (src.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(src);
    return m ? { mime_type: m[1], data: m[2] } : null;
  }
  const res = await safeFetch(src, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    mime_type: res.headers.get("content-type") || "image/jpeg",
    data: buf.toString("base64"),
  };
}

function extractText(data: unknown): string {
  const parts = (
    data as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
  )?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.map((p) => p.text ?? "").join("") : "";
}

export async function POST(request: Request) {
  if (!(await requireUser(request))) {
    return Response.json({ error: "Please sign in to use this." }, { status: 401 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Auto-tag isn't configured yet (missing GEMINI_API_KEY)." },
      { status: 500 },
    );
  }

  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.image) {
    return Response.json({ error: "No image provided." }, { status: 400 });
  }

  let inline: Inline | null;
  try {
    inline = await toInline(body.image);
  } catch {
    inline = null;
  }
  if (!inline) {
    return Response.json({ error: "Couldn't read that image." }, { status: 400 });
  }

  const prompt =
    `You are a fashion cataloguing assistant. Look at the single clothing or accessory item in this photo and describe ONLY that garment (ignore the background, model, or other items). Respond with JSON of this exact shape:\n` +
    `{"name": a short descriptive name like "Cream Cable-Knit Sweater",\n` +
    ` "category": exactly one of [${CATEGORIES.join(", ")}],\n` +
    ` "color": the dominant colour as a #rrggbb hex string,\n` +
    ` "colorName": a common colour name like "navy" or "cream",\n` +
    ` "seasons": an array with any of [${SEASONS.join(", ")}] when it is typically worn,\n` +
    ` "brand": the visible brand name, or null if none is visible,\n` +
    ` "tags": 2-5 lowercase style tags like "casual", "work", "minimal"}\n` +
    `Output only the JSON object.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }, { inline_data: inline }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  };

  let resp: Response;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(payload),
      },
    );
  } catch {
    return Response.json({ error: "Couldn't reach the analysis service." }, { status: 502 });
  }
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    return Response.json({ error: `Analysis error (${resp.status}).`, detail }, { status: 502 });
  }

  const text = extractText(await resp.json());
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    return Response.json({ error: "Couldn't read the analysis. Try again." }, { status: 502 });
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const category = normalizeCategory(parsed.category);
  const color =
    typeof parsed.color === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.color)
      ? parsed.color
      : undefined;
  const seasons = Array.isArray(parsed.seasons)
    ? parsed.seasons.filter((s): s is string => SEASONS.includes(s as string))
    : [];
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return Response.json({
    name: str(parsed.name),
    category,
    color,
    colorName: str(parsed.colorName),
    seasons,
    tags,
    brand: str(parsed.brand),
  });
}
