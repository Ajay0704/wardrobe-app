/**
 * Whole-outfit garment detector. Given one photo, Gemini returns EVERY wearable
 * item (top, bottom, dress, outerwear, shoes, bag, accessory) with a bounding box
 * plus attributes — in a single vision call. The client crops each box and cuts it
 * out. Unlike SegFormer (which merges a jacket into the top and only catches a few
 * accessories), the model separates layers and finds accessories by name.
 *
 * Mirrors /api/analyze (raw Gemini REST, x-goog-api-key, thought-part filtering).
 */
import { requireUser } from "@/lib/auth-server";
import { safeFetch } from "@/lib/net";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "gemini-3.5-flash";
const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"];
const SEASONS = ["spring", "summer", "fall", "winter"];

function normalizeCategory(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.toLowerCase().trim();
  if (CATEGORIES.includes(v)) return v;
  if (/(t-?shirt|shirt|blouse|sweater|top|tee|tank|hoodie|cardigan|polo|knit)/.test(v)) return "top";
  if (/(jean|pant|trouser|short|skirt|legging|chino|bottom|slacks)/.test(v)) return "bottom";
  if (/(dress|gown|jumpsuit|romper)/.test(v)) return "dress";
  if (/(jacket|coat|blazer|outerwear|parka|overcoat|vest|windbreaker)/.test(v)) return "outerwear";
  if (/(shoe|sneaker|boot|heel|sandal|loafer|trainer|footwear)/.test(v)) return "shoes";
  if (/(bag|purse|tote|backpack|clutch|handbag)/.test(v)) return "bag";
  if (/(hat|cap|scarf|belt|jewel|necklace|ring|watch|glove|sunglass|tie|accessor)/.test(v)) return "accessory";
  return undefined;
}

interface Inline {
  mime_type: string;
  data: string;
}

async function toInline(src: string): Promise<Inline | null> {
  if (src.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(src);
    return m ? { mime_type: m[1], data: m[2] } : null;
  }
  const res = await safeFetch(src, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { mime_type: res.headers.get("content-type") || "image/jpeg", data: buf.toString("base64") };
}

function extractText(data: unknown): string {
  const parts = (
    data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }
  )?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
}

/** Gemini box_2d is [ymin,xmin,ymax,xmax] normalized 0-1000 → {x,y,w,h} in 0-1. */
function toBox(raw: unknown): { x: number; y: number; w: number; h: number } | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = raw.map((n) => Number(n));
  if ([ymin, xmin, ymax, xmax].some((n) => !Number.isFinite(n))) return null;
  const x = Math.min(xmin, xmax) / 1000;
  const y = Math.min(ymin, ymax) / 1000;
  const w = Math.abs(xmax - xmin) / 1000;
  const h = Math.abs(ymax - ymin) / 1000;
  if (w <= 0.01 || h <= 0.01) return null;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    w: Math.max(0, Math.min(1, w)),
    h: Math.max(0, Math.min(1, h)),
  };
}

export async function POST(request: Request) {
  if (!(await requireUser(request))) {
    return Response.json({ error: "Please sign in to use this." }, { status: 401 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Detection isn't configured yet (missing GEMINI_API_KEY)." },
      { status: 500 },
    );
  }

  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.image) return Response.json({ error: "No image provided." }, { status: 400 });

  let inline: Inline | null;
  try {
    inline = await toInline(body.image);
  } catch {
    inline = null;
  }
  if (!inline) return Response.json({ error: "Couldn't read that image." }, { status: 400 });

  const prompt =
    `You are a fashion cataloguing assistant. Find EVERY distinct wearable item the person is ` +
    `wearing or carrying: tops, bottoms, dresses, outerwear (jackets/blazers/coats), shoes, bags, ` +
    `and accessories (belt, hat, scarf, sunglasses, watch, jewellery). A jacket or blazer worn OVER ` +
    `a shirt is TWO separate items (one "outerwear" and one "top"). Return a SEPARATE item for the ` +
    `top, the bottom (trousers/jeans/skirt/shorts), and the shoes whenever each is visible — even if ` +
    `only partly in frame. Ignore skin, background and the person. Respond with JSON of this exact shape:\n` +
    `{"items": [{\n` +
    ` "box_2d": [ymin, xmin, ymax, xmax] as integers 0-1000,\n` +
    ` "category": exactly one of [${CATEGORIES.join(", ")}],\n` +
    ` "name": a short descriptive name like "Striped sky-blue shirt",\n` +
    ` "color": dominant colour as #rrggbb,\n` +
    ` "colorName": a common colour name,\n` +
    ` "seasons": any of [${SEASONS.join(", ")}],\n` +
    ` "tags": 2-5 lowercase style tags\n` +
    `}]}\nList each item once. Output only the JSON object.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }, { inline_data: inline }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      thinkingConfig: { thinkingLevel: "minimal" },
    },
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
    return Response.json({ error: "Couldn't reach the detection service." }, { status: 502 });
  }
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    return Response.json({ error: `Detection error (${resp.status}).`, detail }, { status: 502 });
  }

  const text = extractText(await resp.json());
  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    return Response.json({ error: "Couldn't read the detection. Try again." }, { status: 502 });
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const garments = items
    .map((raw) => {
      const it = raw as Record<string, unknown>;
      const category = normalizeCategory(it.category);
      const box = toBox(it.box_2d);
      if (!category || !box) return null;
      const seasons = Array.isArray(it.seasons)
        ? it.seasons.filter((s): s is string => SEASONS.includes(s as string))
        : [];
      const tags = Array.isArray(it.tags)
        ? it.tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.toLowerCase().trim())
            .filter(Boolean)
            .slice(0, 6)
        : [];
      const color =
        typeof it.color === "string" && /^#[0-9a-fA-F]{6}$/.test(it.color) ? it.color : undefined;
      return { category, box, name: str(it.name), color, colorName: str(it.colorName), seasons, tags };
    })
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
    .slice(0, 12);

  return Response.json({ garments });
}
