/**
 * Stylist tools — thin wrappers over the existing deterministic engines. These
 * choose the actual item IDs + scores; the LLM only narrates the result. Pure
 * except for an optional weather lookup (Open-Meteo, no key). Every engine here
 * already runs client-side elsewhere in the app (Today, Rediscover, Smart-Buy,
 * Insights), so this is orchestration, not new logic.
 */

import { scorePair } from "../color";
import { computeFullInsights } from "../insights";
import { generateOutfit, outfitScore } from "../matching";
import { primaryStyleVibe, type UserProfile } from "../profile";
import { forgottenItems, styleWays } from "../rediscover";
import { analyzeSmartBuy } from "../smart-buy";
import type { SlotKey, WardrobeItem } from "../types";
import { SLOT_CONFIG, slotForCategory } from "../types";
import { fetchWeatherForPlace, type WeatherSnapshot } from "../weather";
import type {
  CompactItem,
  CompactResult,
  OutfitCardData,
  StylistBlock,
  StylistChip,
  StylistIntent,
  StylistSlots,
} from "./types";

export interface ToolContext {
  items: WardrobeItem[];
  profile: UserProfile;
  /** Item IDs of the most recent outfit shown (for swap_piece). */
  lastOutfitIds?: string[];
  /** A resolved product for buy_advice (the caller fetches it from a URL). */
  product?: WardrobeItem;
  /** Pre-resolved weather (skips the network fetch; pass null to force skip). */
  weather?: WeatherSnapshot | null;
}

export interface ToolResult {
  blocks: StylistBlock[];
  compact: CompactResult;
}

const emptyDraft = (): Record<SlotKey, string[]> => ({
  top: [],
  bottom: [],
  dress: [],
  outerwear: [],
  shoes: [],
  accessories: [],
});

const owned = (items: WardrobeItem[]) => items.filter((it) => !it.wishlist);
const idMap = (items: WardrobeItem[]) => new Map(items.map((it) => [it.id, it]));

function draftIds(draft: Record<SlotKey, string[]>): string[] {
  return SLOT_CONFIG.flatMap((s) => draft[s.key] ?? []);
}

function draftFromItems(items: WardrobeItem[]): Record<SlotKey, string[]> {
  const draft = emptyDraft();
  for (const it of items) {
    const slot = slotForCategory(it.category);
    const max = SLOT_CONFIG.find((s) => s.key === slot)?.max ?? 1;
    if (draft[slot].length < max) draft[slot].push(it.id);
  }
  return draft;
}

function compactItems(items: WardrobeItem[]): CompactItem[] {
  return items.map((it) => ({
    name: it.name,
    colorName: it.colorName,
    category: it.category,
  }));
}

/** Short deterministic "why" line — the offline/instant fallback for a look. */
function describeOutfit(items: WardrobeItem[]): string {
  if (items.length < 2) return "A simple, easy look.";
  const kinds = items
    .slice(1)
    .map((o) => scorePair(items[0].color, o.color).kind);
  if (kinds.includes("neutral")) return "Neutral tones that keep it easy to wear.";
  if (kinds.includes("monochrome") || kinds.includes("analogous"))
    return "Colours that stay in the same family.";
  if (kinds.includes("complementary")) return "A confident pop of contrast.";
  if (kinds.includes("triadic")) return "A balanced, colourful mix.";
  return "An easy pairing from your closet.";
}

function money(n: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n)}`;
  }
}

/** Do the owned items support at least one complete look? */
function dressability(own: WardrobeItem[]): { ok: boolean; needed: string } {
  const has = (c: WardrobeItem["category"]) => own.some((it) => it.category === c);
  const shoes = has("shoes");
  const core = has("dress") || (has("top") && has("bottom"));
  if (shoes && core) return { ok: true, needed: "" };
  const missing: string[] = [];
  if (!has("top") && !has("dress")) missing.push("a top");
  if (!has("bottom") && !has("dress")) missing.push("a bottom");
  if (!shoes) missing.push("shoes");
  return { ok: false, needed: missing.join(", ") || "a few more pieces" };
}

/** Generate the best-scoring distinct look over a few tries. */
function bestOutfit(
  own: WardrobeItem[],
  opts: { vibe?: string; season?: WardrobeItem["seasons"][number]; anchor?: WardrobeItem },
  byId: Map<string, WardrobeItem>,
  tries = 6,
): OutfitCardData | null {
  let best: { draft: Record<SlotKey, string[]>; ids: string[]; score: number } | null = null;
  const seen = new Set<string>();
  for (let i = 0; i < tries; i++) {
    const draft = generateOutfit(own, opts);
    const ids = draftIds(draft);
    if (ids.length < 2) continue;
    const key = [...ids].sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const its = ids.map((id) => byId.get(id)).filter((x): x is WardrobeItem => !!x);
    const score = outfitScore(its);
    if (!best || score > best.score) best = { draft, ids, score };
  }
  if (!best) return null;
  const its = best.ids.map((id) => byId.get(id)!).filter(Boolean);
  return { itemIds: best.ids, score: best.score, draft: best.draft, reason: describeOutfit(its) };
}

async function resolveWeather(
  ctx: ToolContext,
  slots: StylistSlots,
): Promise<WeatherSnapshot | null> {
  if (slots.season) return null; // user was explicit — don't override
  if (ctx.weather !== undefined) return ctx.weather;
  const place = ctx.profile.location?.trim();
  if (!place) return null;
  try {
    return await fetchWeatherForPlace(place, 5000);
  } catch {
    return null;
  }
}

const outfitBlock = (o: OutfitCardData): StylistBlock => ({ type: "outfit", outfit: o });
const chipsBlock = (chips: StylistChip[]): StylistBlock => ({ type: "chips", chips });

const TWEAK_CHIPS: StylistChip[] = [
  { label: "Another option", send: "show me another option" },
  { label: "More formal", send: "make it more formal" },
  { label: "Warmer", send: "something warmer" },
];

const START_CHIPS: StylistChip[] = [
  { label: "Dress me today", send: "what should I wear today?" },
  { label: "For work", send: "what should I wear to work?" },
  { label: "What am I not wearing?", send: "what am I not wearing?" },
  { label: "Closet stats", send: "show my closet stats" },
];

/** Route an intent to its engine(s) and produce UI blocks + a narration seed. */
export async function runTool(
  intent: StylistIntent,
  slots: StylistSlots,
  ctx: ToolContext,
): Promise<ToolResult> {
  const own = owned(ctx.items);
  const byId = idMap(ctx.items);

  switch (intent) {
    case "dress_me":
    case "dress_for_event": {
      const check = dressability(own);
      if (!check.ok) {
        return {
          blocks: [{ type: "empty_closet", needed: check.needed }],
          compact: { intent, note: `needs ${check.needed}` },
        };
      }
      const weather = await resolveWeather(ctx, slots);
      const season = slots.season ?? (weather ? (weather.needsOuterwear ? "winter" : weather.season) : undefined);
      const vibe = slots.vibe ?? primaryStyleVibe(ctx.profile);
      const outfit = bestOutfit(own, { vibe, season }, byId);
      if (!outfit) {
        return {
          blocks: [{ type: "empty_closet", needed: check.needed || "a few more pieces" }],
          compact: { intent, note: "couldn't form a look" },
        };
      }
      const note = slots.event
        ? slots.event
        : weather
          ? weather.label
          : undefined;
      return {
        blocks: [outfitBlock(outfit), chipsBlock(TWEAK_CHIPS)],
        compact: {
          intent,
          outfit: { items: compactItems(outfit.itemIds.map((id) => byId.get(id)!).filter(Boolean)), score: outfit.score },
          note,
        },
      };
    }

    case "swap_piece": {
      const prevItems = (ctx.lastOutfitIds ?? [])
        .map((id) => byId.get(id))
        .filter((x): x is WardrobeItem => !!x);
      // Targeted swap of one slot, keeping the rest of the current look.
      if (slots.slot && prevItems.length && !slots.regenerate) {
        const swapped = swapSlot(prevItems, slots.slot, own, byId);
        if (swapped) {
          return {
            blocks: [outfitBlock(swapped), chipsBlock(TWEAK_CHIPS)],
            compact: {
              intent,
              outfit: { items: compactItems(swapped.itemIds.map((id) => byId.get(id)!).filter(Boolean)), score: swapped.score },
              note: `swapped the ${slots.slot}`,
            },
          };
        }
      }
      // Otherwise regenerate a fresh look honouring any vibe/season tweak.
      const vibe = slots.vibe ?? primaryStyleVibe(ctx.profile);
      const outfit = bestOutfit(own, { vibe, season: slots.season }, byId, 8);
      if (!outfit) {
        return {
          blocks: [chipsBlock(START_CHIPS)],
          compact: { intent, note: "no look yet" },
        };
      }
      return {
        blocks: [outfitBlock(outfit), chipsBlock(TWEAK_CHIPS)],
        compact: {
          intent,
          outfit: { items: compactItems(outfit.itemIds.map((id) => byId.get(id)!).filter(Boolean)), score: outfit.score },
        },
      };
    }

    case "forgotten": {
      const list = forgottenItems(own, 8);
      if (!list.length) {
        return {
          blocks: [chipsBlock(START_CHIPS)],
          compact: { intent, note: "closet empty" },
        };
      }
      const blocks: StylistBlock[] = [
        { type: "item_list", title: "Least-worn pieces", itemIds: list.map((it) => it.id) },
      ];
      const ideas = styleWays(list[0], own, 2);
      if (ideas.length) {
        blocks.push({
          type: "carousel",
          outfits: ideas.map((idea) => ({
            itemIds: idea.itemIds,
            score: idea.score,
            draft: draftFromItems(idea.items),
            reason: idea.reason,
          })),
        });
      }
      return {
        blocks,
        compact: {
          intent,
          items: compactItems(list.slice(0, 5)),
          note: `styling the ${list[0].name}`,
        },
      };
    }

    case "closet_stats": {
      const full = computeFullInsights(ctx.items);
      const cur = ctx.profile.currency;
      const rows: { label: string; value: string }[] = [
        { label: "Pieces owned", value: String(full.itemCount) },
        { label: "Worn at least once", value: `${full.wornPct}%` },
        { label: "Never worn", value: String(full.neverWorn.length) },
      ];
      if (full.value > 0) rows.push({ label: "Total value", value: money(full.value, cur) });
      if (full.bestValue)
        rows.push({
          label: "Best value",
          value: `${full.bestValue.item.name} · ${money(full.bestValue.costPerWear, cur)}/wear`,
        });
      if (full.categories[0])
        rows.push({ label: "Biggest category", value: `${full.categories[0].label} (${full.categories[0].count})` });
      return {
        blocks: [{ type: "insight", title: "Your closet", rows }],
        compact: { intent, stats: rows },
      };
    }

    case "style_anchor": {
      const anchor = slots.anchorId ? byId.get(slots.anchorId) : undefined;
      if (!anchor) {
        return {
          blocks: [chipsBlock(START_CHIPS)],
          compact: { intent, note: "no item attached" },
        };
      }
      const ideas = styleWays(anchor, own, 3);
      if (!ideas.length) {
        return {
          blocks: [{ type: "empty_closet", needed: "a few more pieces to pair with it" }],
          compact: { intent, note: `can't style the ${anchor.name} yet` },
        };
      }
      return {
        blocks: [
          {
            type: "carousel",
            outfits: ideas.map((idea) => ({
              itemIds: idea.itemIds,
              score: idea.score,
              draft: draftFromItems(idea.items),
              reason: idea.reason,
            })),
          },
        ],
        compact: {
          intent,
          outfits: ideas.map((idea) => ({ items: compactItems(idea.items), score: idea.score })),
          note: `ways to wear the ${anchor.name}`,
        },
      };
    }

    case "buy_advice": {
      const product = ctx.product;
      if (!product) {
        return {
          blocks: [chipsBlock(START_CHIPS)],
          compact: { intent, note: "no product provided" },
        };
      }
      const res = analyzeSmartBuy(product, ctx.items, { styleVibes: ctx.profile.styleVibes });
      return {
        blocks: [
          {
            type: "verdict",
            verdict: {
              verdict: res.verdict,
              verdictLabel: res.verdictLabel,
              pairsWithIds: res.pairsWith.map((p) => p.item.id),
              redundantIds: res.redundant.map((it) => it.id),
              reasons: res.reasons,
              costPerWear: res.costPerWear,
              subject: {
                name: product.name,
                imageUrl: product.imageUrl,
                brand: product.brand,
                price: product.price,
              },
            },
          },
        ],
        compact: {
          intent,
          verdict: { verdict: res.verdict, label: res.verdictLabel, subject: product.name },
        },
      };
    }

    case "pack_trip": {
      const check = dressability(own);
      if (!check.ok) {
        return {
          blocks: [{ type: "empty_closet", needed: check.needed }],
          compact: { intent, note: `needs ${check.needed}` },
        };
      }
      let weather: WeatherSnapshot | null = null;
      if (!slots.season && slots.place) {
        try {
          weather = await fetchWeatherForPlace(slots.place, 5000);
        } catch {
          weather = null;
        }
      }
      const season = slots.season ?? (weather ? (weather.needsOuterwear ? "winter" : weather.season) : undefined);
      const vibe = slots.vibe ?? primaryStyleVibe(ctx.profile);
      const capsule: OutfitCardData[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < 18 && capsule.length < 3; i++) {
        const o = bestOutfit(own, { vibe, season }, byId, 2);
        if (!o) break;
        const key = [...o.itemIds].sort().join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        capsule.push(o);
      }
      if (!capsule.length) {
        return {
          blocks: [{ type: "empty_closet", needed: "a few more pieces" }],
          compact: { intent, note: "couldn't pack a capsule" },
        };
      }
      return {
        blocks: [{ type: "carousel", outfits: capsule }],
        compact: {
          intent,
          outfits: capsule.map((o) => ({
            items: compactItems(o.itemIds.map((id) => byId.get(id)!).filter(Boolean)),
            score: o.score,
          })),
          note: slots.place ? `packing for ${slots.place}${weather ? ` (${weather.label})` : ""}` : "trip capsule",
        },
      };
    }

    case "compare_options": {
      const ids = (slots.compareIds ?? []).slice(0, 2);
      const picks = ids.map((id) => byId.get(id)).filter((x): x is WardrobeItem => !!x);
      if (picks.length < 2) {
        return {
          blocks: [chipsBlock(START_CHIPS)],
          compact: { intent, note: "need two items" },
        };
      }
      const others = own.filter((it) => !ids.includes(it.id));
      const affinity = (it: WardrobeItem) =>
        others.length
          ? others.reduce((s, o) => s + scorePair(it.color, o.color).score, 0) / others.length
          : 50;
      const [a, b] = picks;
      const sa = affinity(a);
      const sb = affinity(b);
      const winner = sa >= sb ? a : b;
      const loser = sa >= sb ? b : a;
      return {
        blocks: [
          { type: "item_list", title: "Comparing", itemIds: ids },
        ],
        compact: {
          intent,
          winner: { name: winner.name, over: loser.name },
          note: `${winner.name} pairs with more of your closet`,
        },
      };
    }

    case "off_topic":
      return {
        blocks: [chipsBlock(START_CHIPS)],
        compact: { intent, note: "off topic" },
      };

    case "clarify":
    default:
      return {
        blocks: [chipsBlock(START_CHIPS)],
        compact: { intent: "clarify", note: "clarify" },
      };
  }
}

/** Replace one slot of the current look, keeping the rest, by best colour harmony. */
function swapSlot(
  prevItems: WardrobeItem[],
  dropSlot: SlotKey,
  own: WardrobeItem[],
  byId: Map<string, WardrobeItem>,
): OutfitCardData | null {
  const prevIds = new Set(prevItems.map((i) => i.id));
  const kept = prevItems.filter((i) => slotForCategory(i.category) !== dropSlot);
  const cats = SLOT_CONFIG.find((s) => s.key === dropSlot)?.categories ?? [];
  const candidates = own.filter((i) => cats.includes(i.category) && !prevIds.has(i.id));
  if (!candidates.length) return null;
  const scored = candidates
    .map((c) => ({
      c,
      s: kept.length ? Math.min(...kept.map((k) => scorePair(k.color, c.color).score)) : 80,
    }))
    .sort((x, y) => y.s - x.s);
  const topK = scored.slice(0, Math.min(3, scored.length));
  const pick = topK[Math.floor(Math.random() * topK.length)].c;
  const newItems = [...kept, pick];
  const draft = draftFromItems(newItems);
  const ids = draftIds(draft);
  const its = ids.map((id) => byId.get(id)!).filter(Boolean);
  return { itemIds: ids, score: outfitScore(its), draft, reason: `Swapped the ${dropSlot}.` };
}
