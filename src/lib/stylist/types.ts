/**
 * Stylist chatbot — shared types.
 *
 * The Stylist is a closet-grounded assistant. The deterministic engines
 * (matching / rediscover / smart-buy / insights) choose the actual item IDs and
 * scores client-side; the LLM only writes a short narration about the result and
 * NEVER sees or picks item IDs. These types are the contract between the intent
 * classifier, the tools, the UI blocks, and the narration route.
 */

import type { Season, SlotKey } from "../types";

export type StylistIntent =
  | "dress_me"
  | "dress_for_event"
  | "swap_piece"
  | "style_anchor"
  | "forgotten"
  | "closet_stats"
  | "buy_advice"
  | "pack_trip"
  | "compare_options"
  | "clarify"
  | "off_topic";

/** Slots pulled out of the user's message by the keyword classifier. */
export interface StylistSlots {
  /** Preferred tag/vibe fed to generateOutfit ("casual", "work", "formal"...). */
  vibe?: string;
  /** Preferred season. */
  season?: Season;
  /** Raw occasion phrase for narration ("a wedding", "work"). */
  event?: string;
  /** Which slot to swap (swap_piece). */
  slot?: SlotKey;
  /** Whether the user asked to regenerate the whole look ("something else"). */
  regenerate?: boolean;
  /** Attached owned/wishlist item (style_anchor, buy_advice on a wishlist item). */
  anchorId?: string;
  /** Two attached items to compare (compare_options). */
  compareIds?: string[];
  /** Product URL pasted for buy advice. */
  url?: string;
  /** Trip destination (pack_trip). */
  place?: string;
}

/** A tappable quick-reply. Tapping it submits `send` as if the user typed it. */
export interface StylistChip {
  label: string;
  send: string;
}

/** An outfit the engine produced. `draft` restores the exact builder slots. */
export interface OutfitCardData {
  itemIds: string[];
  score: number;
  draft: Record<SlotKey, string[]>;
  /** Optional short "why" from the engine (styleWays); narration usually covers it. */
  reason?: string;
}

/** Smart-buy verdict payload (Phase B). */
export interface VerdictCardData {
  verdict: "buy" | "maybe" | "skip";
  verdictLabel: string;
  /** Owned items this would pair with. */
  pairsWithIds: string[];
  /** Owned items that look redundant with it. */
  redundantIds: string[];
  reasons: { tone: "good" | "warn" | "info"; text: string }[];
  costPerWear: number | null;
  /** The product/wishlist item being judged (for the header thumbnail). */
  subject: { name: string; imageUrl?: string; brand?: string; price?: number };
}

/** UI blocks rendered inside a bot turn (below its narration text bubble). */
export type StylistBlock =
  | { type: "outfit"; outfit: OutfitCardData }
  | { type: "carousel"; outfits: OutfitCardData[] }
  | { type: "item_list"; title: string; itemIds: string[] }
  | { type: "insight"; title: string; rows: { label: string; value: string }[] }
  | { type: "verdict"; verdict: VerdictCardData }
  | { type: "chips"; chips: StylistChip[] }
  | { type: "empty_closet"; needed: string };

export type StylistRole = "user" | "bot";

export interface StylistTurn {
  id: string;
  role: StylistRole;
  /** Narration / user message text. May be filled in async for a bot turn. */
  text?: string;
  blocks?: StylistBlock[];
  /** True while narration is still being fetched (shows a typing indicator). */
  pending?: boolean;
  createdAt: number;
}

/* ------------------------------------------------------------------ *
 * Narration request/response — the ONLY data that leaves the device. *
 * Item names/colors/categories + scores, never IDs, never images.    *
 * ------------------------------------------------------------------ */

export interface CompactItem {
  name: string;
  colorName?: string;
  category: string;
}

export interface CompactResult {
  intent: StylistIntent;
  /** Single chosen look (dress_me / dress_for_event / swap_piece / style_anchor). */
  outfit?: { items: CompactItem[]; score: number };
  /** Multiple looks (style_anchor ways, trip capsule). */
  outfits?: { items: CompactItem[]; score: number }[];
  /** Loose item list (forgotten). */
  items?: CompactItem[];
  /** Numeric stats (closet_stats). */
  stats?: { label: string; value: string }[];
  /** Buy verdict (buy_advice). */
  verdict?: { verdict: string; label: string; subject: string };
  /** Compare recommendation (compare_options). */
  winner?: { name: string; over: string };
  /** Freeform context note (event name, weather, place). */
  note?: string;
}

export interface StylistChatRequest {
  intent: StylistIntent;
  message: string;
  compact: CompactResult;
  history: { role: StylistRole; text: string }[];
}

export interface StylistChatResponse {
  text: string;
}
