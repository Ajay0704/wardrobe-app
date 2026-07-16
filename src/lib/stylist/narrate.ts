/**
 * Stylist narration — the only place the app talks to the LLM.
 *
 * `templateReason` is a deterministic sentence built from the engine result; it
 * renders instantly and is the fallback whenever the network / key / model is
 * unavailable. `postNarration` asks /api/stylist/chat to rewrite that into a
 * warmer ≤3-sentence line, but if anything goes wrong it silently falls back to
 * the template — the cards are already on screen either way.
 */

import { authHeaders } from "../supabase/client";
import type { CompactItem, CompactResult, StylistChatRequest } from "./types";

function list(items: CompactItem[]): string {
  const names = items.map((i) => i.name).filter(Boolean);
  if (names.length === 0) return "a few pieces";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const scoreWord = (s: number) => (s >= 80 ? "a sharp" : s >= 60 ? "a solid" : "an easy");

/** Deterministic narration from the engine output (instant + offline fallback). */
export function templateReason(c: CompactResult): string {
  switch (c.intent) {
    case "dress_me":
    case "dress_for_event": {
      if (!c.outfit) return "Add a couple more pieces and I'll put a look together.";
      const where = c.note ? ` for ${c.note}` : "";
      return `Here's ${scoreWord(c.outfit.score)} look${where}: ${list(c.outfit.items)}.`;
    }
    case "swap_piece":
      if (!c.outfit) return "Tell me what to change and I'll rework it.";
      return `Try this instead: ${list(c.outfit.items)}.`;
    case "style_anchor":
      if (!c.outfits?.length) return "Attach an item and I'll show a few ways to wear it.";
      return `${c.note ? cap(c.note) : "A few ways to wear it"} — take a look.`;
    case "forgotten":
      if (!c.items?.length) return "Your closet's looking well-used already.";
      return `You haven't reached for ${list(c.items)} lately${c.note ? ` — ${c.note}` : ""}.`;
    case "closet_stats": {
      const top = c.stats?.slice(0, 2).map((r) => `${r.label.toLowerCase()} ${r.value}`).join(", ");
      return top ? `Quick read: ${top}.` : "Here's your closet at a glance.";
    }
    case "buy_advice":
      if (!c.verdict) return "Paste a product link or attach a wishlist item and I'll weigh in.";
      return `${c.verdict.label} — here's how ${c.verdict.subject} fits your closet.`;
    case "pack_trip":
      if (!c.outfits?.length) return "Add a few more pieces and I'll pack a capsule.";
      return `${c.note ? cap(c.note) : "A little capsule"} — ${c.outfits.length} looks to mix and match.`;
    case "compare_options":
      if (!c.winner) return "Attach two items and I'll tell you which works harder.";
      return `I'd go with ${c.winner.name} over ${c.winner.over} — it pairs with more of your closet.`;
    case "off_topic":
      return "I stick to styling what's already in your closet. Want a look for today?";
    case "clarify":
    default:
      return "I can dress you from your closet — what's the occasion?";
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ask the LLM to narrate; fall back to the template on any failure. */
export async function postNarration(req: StylistChatRequest): Promise<string> {
  try {
    const res = await fetch("/api/stylist/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(req),
    });
    if (!res.ok) return templateReason(req.compact);
    const json = (await res.json()) as { text?: string };
    const text = json.text?.trim();
    return text || templateReason(req.compact);
  } catch {
    return templateReason(req.compact);
  }
}
