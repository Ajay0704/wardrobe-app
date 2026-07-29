import { requireUser } from "@/lib/auth-server";
import { safeFetch } from "@/lib/net";
import { inferSubcategory } from "@/lib/subcategory";
import type { Category } from "@/lib/types";
import { normalizeFit } from "@/lib/analyze-attrs";
import { parseModelJson } from "@/lib/model-json";
import {
  ANALYZE_FORMALITY,
  ANALYZE_GENERATION_CONFIG,
  ANALYZE_TONE,
  buildAnalyzePrompt,
} from "@/lib/analyze-prompt";

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
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    }
  )?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  // Skip Gemini "thinking" parts — only the final answer text is JSON.
  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
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

  const prompt = buildAnalyzePrompt();

  const payload = {
    contents: [{ parts: [{ text: prompt }, { inline_data: inline }] }],
    generationConfig: ANALYZE_GENERATION_CONFIG,
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

  const parsed = parseModelJson(extractText(await resp.json()));
  if (!parsed) {
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

  const formalityRaw = str(parsed.formality)?.toLowerCase();
  const formality =
    formalityRaw && ANALYZE_FORMALITY.includes(formalityRaw) ? formalityRaw : undefined;
  // Normalized here as well as on the client so the endpoint's own contract is canonical:
  // the model happily answers "oversized" or "straight", neither of which is a FIT_VALUE.
  const fit = normalizeFit(parsed.fit);
  const material = str(parsed.material)?.toLowerCase();
  const pattern = str(parsed.pattern)?.toLowerCase();
  const toneRaw = str(parsed.tone)?.toLowerCase();
  const tone = toneRaw && ANALYZE_TONE.includes(toneRaw) ? toneRaw : undefined;
  const styleCaption = str(parsed.styleCaption);
  // Map the model's free-text garment "type" (+ name/tags) to a canonical sub-category slug for
  // the detected category, reusing the deterministic inferrer so only valid values ever return.
  const subcategory = category
    ? inferSubcategory(category as Category, `${str(parsed.type) ?? ""} ${str(parsed.name) ?? ""}`, tags)
    : undefined;

  return Response.json({
    name: str(parsed.name),
    category,
    subcategory,
    color,
    colorName: str(parsed.colorName),
    seasons,
    tags,
    brand: str(parsed.brand),
    fit,
    formality,
    material,
    pattern,
    tone,
    styleCaption,
  });
}
