/**
 * Stylist intent classifier — keyword/pattern based (no network, instant, free).
 *
 * Deliberately simple and on-brand: the Stylist answers wardrobe questions from
 * the user's closet, so ambiguous input becomes a `clarify` (with chips) and
 * obvious fashion-trivia becomes `off_topic` rather than a hallucinated answer.
 */

import type { Season, SlotKey } from "../types";
import { SEASONS, SUGGESTED_TAGS } from "../types";
import type { StylistIntent, StylistSlots } from "./types";

const URL_RE = /https?:\/\/[^\s]+/i;

/** Occasion word → (vibe tag, optional season). Vibes align with SUGGESTED_TAGS. */
const EVENT_MAP: { re: RegExp; vibe: string; season?: Season; label: string }[] = [
  { re: /\b(wedding|gala|black.?tie|formal|interview|funeral|church|graduation|ceremony)\b/, vibe: "formal", label: "a formal event" },
  { re: /\b(work|office|meeting|business|conference|presentation)\b/, vibe: "work", label: "work" },
  { re: /\b(date night|date|dinner|romantic)\b/, vibe: "date night", label: "a date" },
  { re: /\b(party|club|night out|nightout|birthday|cocktail)\b/, vibe: "party", label: "a party" },
  { re: /\b(gym|workout|work out|run|running|yoga|sport)\b/, vibe: "athleisure", label: "the gym" },
  { re: /\b(beach|pool|resort)\b/, vibe: "casual", season: "summer", label: "the beach" },
  { re: /\b(brunch|coffee|errands|casual|hang|hangout|weekend)\b/, vibe: "casual", label: "something casual" },
];

/** Category keyword → builder slot (mirrors normalizeCategory in /api/analyze). */
const SLOT_KEYWORDS: { re: RegExp; slot: SlotKey }[] = [
  { re: /\b(shoe|shoes|sneaker|boot|heel|sandal|loafer|trainer|footwear)\b/, slot: "shoes" },
  { re: /\b(jacket|coat|blazer|outerwear|parka|overcoat|cardigan|sweater|hoodie)\b/, slot: "outerwear" },
  { re: /\b(jean|jeans|pant|pants|trouser|short|shorts|skirt|legging|chino|bottom)\b/, slot: "bottom" },
  { re: /\b(shirt|tee|t-shirt|tshirt|top|blouse|tank|polo)\b/, slot: "top" },
  { re: /\b(dress|gown)\b/, slot: "dress" },
  { re: /\b(bag|purse|tote|accessory|accessories|hat|scarf|belt|jewel|necklace)\b/, slot: "accessories" },
];

function detectVibe(m: string): string | undefined {
  return SUGGESTED_TAGS.find((t) => m.includes(t));
}

function detectSeason(m: string): Season | undefined {
  const direct = SEASONS.find((s) => m.includes(s));
  if (direct) return direct;
  if (/\b(hot|warm|heat|sunny)\b/.test(m)) return "summer";
  if (/\b(cold|freezing|snow|winter|chilly)\b/.test(m)) return "winter";
  if (/\bautumn\b/.test(m)) return "fall";
  if (/\b(rain|rainy|wet)\b/.test(m)) return "fall";
  return undefined;
}

function detectEvent(m: string): { vibe: string; season?: Season; label: string } | undefined {
  return EVENT_MAP.find((e) => e.re.test(m));
}

function detectSlot(m: string): SlotKey | undefined {
  return SLOT_KEYWORDS.find((s) => s.re.test(m))?.slot;
}

export interface Classification {
  intent: StylistIntent;
  slots: StylistSlots;
}

/**
 * Classify a user message into a single intent + extracted slots.
 * `attachedIds` are items the user attached via the composer (anchor/compare).
 */
export function classifyIntent(
  raw: string,
  attachedIds: string[] = [],
): Classification {
  const m = raw.toLowerCase().trim();
  const url = raw.match(URL_RE)?.[0];
  const slots: StylistSlots = {};
  const vibe = detectVibe(m);
  const season = detectSeason(m);
  if (vibe) slots.vibe = vibe;
  if (season) slots.season = season;

  // buy advice — a link or an explicit "should I buy" (Phase B).
  if (url || /\b(should i buy|worth buying|buy this|is it worth|good buy)\b/.test(m)) {
    if (url) slots.url = url;
    if (attachedIds[0]) slots.anchorId = attachedIds[0];
    return { intent: "buy_advice", slots };
  }

  // compare two attached items (Phase C).
  if (attachedIds.length >= 2 || /\b(which of these|compare|which one|vs\.?|or the)\b/.test(m)) {
    slots.compareIds = attachedIds.slice(0, 2);
    return { intent: "compare_options", slots };
  }

  // trip packing (Phase C).
  if (/\b(pack|packing|trip|travel|vacation|holiday|getaway)\b/.test(m)) {
    const place = raw.match(/\b(?:to|for|in)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/)?.[1];
    if (place) slots.place = place;
    return { intent: "pack_trip", slots };
  }

  // "how do I wear this / ways to wear / what goes with" — needs an anchor.
  if (/\b(how (do|should) i wear|ways to wear|style this|style these|what goes with|pair with|wear this|wear these)\b/.test(m)) {
    if (attachedIds[0]) slots.anchorId = attachedIds[0];
    return { intent: "style_anchor", slots };
  }

  // forgotten / rediscover.
  if (/\b(not wearing|never worn|haven't worn|havent worn|forgotten|forgot|hidden gem|rediscover|underused|neglected)\b/.test(m)) {
    return { intent: "forgotten", slots };
  }

  // closet stats.
  if (/\b(how many|stats|statistics|cost per wear|cpw|most worn|total value|worth|how much|insights?|breakdown)\b/.test(m)) {
    return { intent: "closet_stats", slots };
  }

  // swap / tweak the current look.
  if (/\b(swap|change|different|other|another|instead|more formal|dressier|more casual|warmer|cooler|lighter|switch)\b/.test(m)) {
    const slot = detectSlot(m);
    if (slot) slots.slot = slot;
    if (/\b(another|something else|other options?|different look|regenerate|start over)\b/.test(m) && !slot) {
      slots.regenerate = true;
    }
    if (/\b(more formal|dressier|smarter)\b/.test(m)) slots.vibe = "formal";
    else if (/\b(more casual|chill|relaxed)\b/.test(m)) slots.vibe = "casual";
    if (/\b(warmer|colder|cold)\b/.test(m)) slots.season = "winter";
    if (/\b(lighter|cooler|hot|warm weather)\b/.test(m)) slots.season = "summer";
    return { intent: "swap_piece", slots };
  }

  // dress for an occasion.
  const event = detectEvent(m);
  if (event) {
    slots.vibe = slots.vibe ?? event.vibe;
    slots.season = slots.season ?? event.season;
    slots.event = event.label;
    return { intent: "dress_for_event", slots };
  }

  // generic "what should I wear".
  if (/\b(what should i wear|what do i wear|dress me|what to wear|outfit|look for|style me|suggest)\b/.test(m)) {
    return { intent: "dress_me", slots };
  }

  // obvious off-topic fashion trivia.
  if (/\b(trend|trending|in style|fashion week|runway|celebrit|what's popular|whats popular|paris|milan)\b/.test(m)) {
    return { intent: "off_topic", slots };
  }

  // a bare greeting or anything else → clarify with chips.
  return { intent: "clarify", slots };
}
