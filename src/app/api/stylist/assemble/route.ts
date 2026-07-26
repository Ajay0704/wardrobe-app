/**
 * Grounded outfit assembly (AJA-38 Phase 3).
 *
 * The client sends ranked candidate looks (real closet item IDs + short labels).
 * Gemini may only choose among those looks — never invent garments. On failure
 * the client keeps the top heuristic look.
 */
import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "gemini-3.5-flash";

export interface AssembleCandidate {
  /** Stable key — usually sorted item ids joined. */
  key: string;
  itemIds: string[];
  labels: string[];
  score: number;
  reasons?: string[];
}

export interface AssembleRequest {
  message: string;
  occasion?: string;
  mood?: string;
  candidates: AssembleCandidate[];
}

function extractText(data: unknown): string {
  const parts = (
    data as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    }
  )?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
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
    return Response.json({ error: "Missing GEMINI_API_KEY." }, { status: 500 });
  }

  let body: AssembleRequest;
  try {
    body = (await request.json()) as AssembleRequest;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 6) : [];
  if (!candidates.length) {
    return Response.json({ error: "No candidates." }, { status: 400 });
  }

  const allowedKeys = new Set(candidates.map((c) => c.key));
  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. key=${c.key} | score=${c.score} | pieces=${c.labels.join("; ")}${
          c.reasons?.length ? ` | why=${c.reasons.join("; ")}` : ""
        }`,
    )
    .join("\n");

  const prompt =
    `You are a closet-grounded fashion stylist. Pick ONE outfit from the numbered candidates below. ` +
    `Reply with JSON only: {"key":"<exact candidate key>","reason":"<one short sentence>"}. ` +
    `You MUST copy the key exactly from the list. Never invent clothes or keys.\n\n` +
    `User said: ${body.message || "dress me"}\n` +
    (body.occasion ? `Occasion: ${body.occasion}\n` : "") +
    (body.mood ? `Mood: ${body.mood}\n` : "") +
    `\nCandidates:\n${list}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
      maxOutputTokens: 200,
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
    return Response.json({ error: "Couldn't reach stylist assemble." }, { status: 502 });
  }
  if (!resp.ok) {
    return Response.json({ error: `Assemble error (${resp.status}).` }, { status: 502 });
  }

  const text = extractText(await resp.json()).trim();
  let parsed: { key?: string; reason?: string };
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim()) as {
      key?: string;
      reason?: string;
    };
  } catch {
    return Response.json({ error: "Bad assemble JSON." }, { status: 502 });
  }

  const chosenKey = typeof parsed.key === "string" ? parsed.key : "";
  if (!allowedKeys.has(chosenKey)) {
    // One soft retry path: if the model returned an index number, map it.
    const idx = Number(chosenKey) - 1;
    if (Number.isInteger(idx) && candidates[idx]) {
      return Response.json({
        key: candidates[idx].key,
        itemIds: candidates[idx].itemIds,
        reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
      });
    }
    return Response.json({ error: "Model picked an unknown key." }, { status: 502 });
  }

  const match = candidates.find((c) => c.key === chosenKey)!;
  return Response.json({
    key: match.key,
    itemIds: match.itemIds,
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : undefined,
  });
}
