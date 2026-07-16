/**
 * Stylist narration proxy. The client has already picked the outfit/items with
 * the deterministic engines; this route only asks Gemini to write a short, warm
 * line about that result. The model NEVER receives item IDs and cannot invent
 * clothes — it only rephrases the compact result it's handed. On any failure the
 * client falls back to its own template, so this route staying strict is safe.
 *
 * Mirrors /api/analyze (raw Gemini REST, x-goog-api-key, thought-part filtering).
 */
import { requireUser } from "@/lib/auth-server";
import type { CompactResult, StylistChatRequest } from "@/lib/stylist/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "gemini-3.5-flash";

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

/** Compact result → a plain-text summary the model rewrites (no IDs, no images). */
function describe(c: CompactResult): string {
  const items = (list?: { name: string; colorName?: string; category: string }[]) =>
    (list ?? [])
      .map((i) => [i.colorName, i.name].filter(Boolean).join(" ") || i.name)
      .join("; ");
  const lines: string[] = [`intent: ${c.intent}`];
  if (c.note) lines.push(`context: ${c.note}`);
  if (c.outfit) lines.push(`look (harmony ${c.outfit.score}/100): ${items(c.outfit.items)}`);
  if (c.outfits?.length)
    lines.push(...c.outfits.map((o, i) => `option ${i + 1} (harmony ${o.score}/100): ${items(o.items)}`));
  if (c.items?.length) lines.push(`items: ${items(c.items)}`);
  if (c.stats?.length) lines.push(...c.stats.map((s) => `${s.label}: ${s.value}`));
  if (c.verdict) lines.push(`verdict on ${c.verdict.subject}: ${c.verdict.label} (${c.verdict.verdict})`);
  if (c.winner) lines.push(`recommend ${c.winner.name} over ${c.winner.over}`);
  return lines.join("\n");
}

const SYSTEM =
  "You are Stylist, a private assistant inside a wardrobe app. You style the user " +
  "ONLY from the pieces listed below — never invent or suggest buying clothes that " +
  "aren't listed. Reply in at most 3 short sentences, warm and specific, referring to " +
  "the pieces by name. Do not use markdown, lists, or emojis. If the context is off-topic " +
  "or a general fashion-trivia question, briefly decline and offer to dress them from their closet.";

export async function POST(request: Request) {
  if (!(await requireUser(request))) {
    return Response.json({ error: "Please sign in to use this." }, { status: 401 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Stylist isn't configured yet (missing GEMINI_API_KEY)." },
      { status: 500 },
    );
  }

  let body: StylistChatRequest;
  try {
    body = (await request.json()) as StylistChatRequest;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body?.message || !body?.compact) {
    return Response.json({ error: "Missing message or result." }, { status: 400 });
  }

  const history = (body.history ?? [])
    .slice(-6)
    .map((h) => `${h.role === "user" ? "User" : "Stylist"}: ${h.text}`)
    .join("\n");

  const prompt =
    `${SYSTEM}\n\n` +
    (history ? `Recent conversation:\n${history}\n\n` : "") +
    `User just said: ${body.message}\n\n` +
    `The engine chose this (rephrase it; do not add pieces):\n${describe(body.compact)}\n\n` +
    `Write the reply now.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
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
    return Response.json({ error: "Couldn't reach the stylist service." }, { status: 502 });
  }
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    return Response.json({ error: `Stylist error (${resp.status}).`, detail }, { status: 502 });
  }

  const text = extractText(await resp.json()).trim();
  if (!text) return Response.json({ error: "Empty response." }, { status: 502 });
  return Response.json({ text });
}
