/**
 * AJA-255 (phase 5 of AJA-248) — feedback loop for the outfit engine.
 *
 * `V2_WEIGHTS` has seven weights and outfit-rules.ts has a dozen curve constants,
 * every one marked TUNE because there has never been a signal saying whether a
 * suggested look was any good. This records that signal.
 *
 * Two design choices worth keeping:
 *
 * 1. A swap is INFERRED, not asked. Removing a piece and adding another in the
 *    same category is a swap, and diffing the two tells you which term misfired
 *    (the replacement is dressier ⇒ the look had been too casual ⇒ the formality
 *    term or the target formality is wrong). That costs the user nothing. The one
 *    event that carries no inferable reason is a re-roll on an untouched board —
 *    that is the only place the UI asks.
 *
 * 2. Provenance is correlated through the event log on `outfitId`, never stored
 *    as a new field on `Outfit`. `normalizeOutfit` in store.ts is a hard
 *    allowlist that has silently dropped new fields four times (AJA-223 / 239 /
 *    244 / 245); not touching it is the fix.
 *
 * Counters mirror to localStorage (same privacy-first pattern as habit.ts) so the
 * Settings readout works signed out and needs no round trip.
 */
import { authHeaders } from "./supabase/client";
import { colourPair, dressiness } from "./outfit-rules";
import type { ScoredLook } from "./matching";
import type { Season, WardrobeItem } from "./types";

export type FeedbackStage = "shown" | "pick" | "swap" | "reroll" | "flag" | "kept" | "worn";

/** Why a piece was replaced. Inferred from the diff; never asked. */
export type SwapReason =
  | "too_dressy"
  | "too_casual"
  | "weather"
  | "colour"
  | "style"
  | "variety";

/**
 * Why a whole look is wrong. Volunteered by tapping the flag — NOT asked.
 *
 * The first version of this popped the chip row up automatically after a re-roll,
 * on the reasoning that a re-roll is the one event with nothing to infer from.
 * That was the wrong trade: it interrupts to ask about a look you have already
 * moved past, and reads as noise rather than as a question worth answering. A
 * flag is opt-in and, because it names the look on the board, it says WHICH of
 * the three was bad instead of only "those three weren't it".
 */
export type FlagReason = "too_dressy" | "too_casual" | "colour" | "weather" | "not_it";

export const FLAG_REASONS: { key: FlagReason; label: string }[] = [
  { key: "too_dressy", label: "Too dressy" },
  { key: "too_casual", label: "Too casual" },
  { key: "colour", label: "Colours" },
  { key: "weather", label: "Weather" },
  { key: "not_it", label: "Just not it" },
];

// ---------------------------------------------------------------------------
// reason inference — pure, so scripts/test-engine-feedback.mts can drive it
// against the real closet without a browser
// ---------------------------------------------------------------------------

const sub = (it: WardrobeItem) => String(it.subcategory || "").toLowerCase().trim();

/** Does this piece suit `season`? An empty list means all-season, not none. */
export function fitsSeason(it: WardrobeItem, season: Season | undefined): boolean {
  if (!season) return true;
  const list = Array.isArray(it.seasons) ? it.seasons : [];
  return list.length === 0 || list.includes(season);
}

/** Mean colour agreement of `it` against the rest of the board. Null if unknowable. */
export function colourFit(it: WardrobeItem, rest: WardrobeItem[]): number | null {
  const others = rest.filter((o) => o.id !== it.id && !!o.color);
  if (!it.color || others.length === 0) return null;
  const sum = others.reduce((acc, o) => acc + colourPair(it.color, o.color).score, 0);
  return sum / others.length;
}

/** A replacement has to beat the piece it replaced by this much to read as a colour fix. */
const COLOUR_DELTA = 0.08;

/**
 * Which scorer term the user just corrected, from the piece they took off and the
 * piece they put on. `rest` is the remainder of the board — colour is only
 * meaningful relative to what it is worn with.
 *
 * Order is by actionability, not confidence: a formality move is a direct vote on
 * a weight, "style" and "variety" are the residue that tunes nothing. TUNE: the
 * one-step dressiness threshold and COLOUR_DELTA are both guesses, which is
 * exactly what this instrumentation exists to replace.
 */
export function inferSwapReason(
  removed: WardrobeItem,
  added: WardrobeItem,
  rest: WardrobeItem[],
  season?: Season,
): SwapReason {
  const dr = dressiness(removed);
  const da = dressiness(added);
  if (dr !== null && da !== null && Math.abs(da - dr) >= 1) {
    // Reaching for something dressier means the look we offered was too casual.
    return da > dr ? "too_casual" : "too_dressy";
  }
  if (season && !fitsSeason(removed, season) && fitsSeason(added, season)) return "weather";
  const cr = colourFit(removed, rest);
  const ca = colourFit(added, rest);
  if (cr !== null && ca !== null && ca - cr >= COLOUR_DELTA) return "colour";
  if (sub(removed) !== sub(added)) return "style";
  return "variety";
}

// ---------------------------------------------------------------------------
// session state — a slate only means something inside the session that made it,
// so this is deliberately module memory rather than persisted store state
// ---------------------------------------------------------------------------

interface SlateLook {
  slot: string;
  itemIds: string[];
  subs: string[];
  score: number;
  signals: Record<string, number>;
}

interface Slate {
  id: string;
  engine: "v2";
  season?: Season;
  looks: SlateLook[];
  /** Which of the three is on the board. */
  idx: number;
  /** Set once the user edits the board — an edited look was engaged with, not rejected. */
  touched: boolean;
  /** Set once a reroll/kept has been counted, so one slate can't be scored twice. */
  closed: boolean;
}

let current: Slate | null = null;
let pendingRemoval: { item: WardrobeItem; rest: WardrobeItem[]; at: number } | null = null;
/** A removal only pairs with an add that follows it fairly promptly. */
const SWAP_WINDOW_MS = 45_000;

function sid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// local counters — what the Settings row reads
// ---------------------------------------------------------------------------

const KEY = "wardrobe:engine-feedback-v1";

export interface FeedbackCounters {
  shown: number;
  picks: number;
  swaps: number;
  rerolls: number;
  /** Looks the user explicitly flagged as bad. */
  flags: number;
  kept: number;
  worn: number;
  /** Swap + reroll reason tallies, so the readout can name the top complaint. */
  reasons: Record<string, number>;
}

function empty(): FeedbackCounters {
  return { shown: 0, picks: 0, swaps: 0, rerolls: 0, flags: 0, kept: 0, worn: 0, reasons: {} };
}

export function readEngineFeedback(): FeedbackCounters {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<FeedbackCounters>;
    return {
      ...empty(),
      ...p,
      reasons: p.reasons && typeof p.reasons === "object" ? p.reasons : {},
    };
  } catch {
    return empty();
  }
}

function bump(patch: Partial<Record<keyof FeedbackCounters, number>>, reason?: string) {
  if (typeof window === "undefined") return;
  try {
    const c = readEngineFeedback();
    for (const [k, v] of Object.entries(patch)) {
      if (k === "reasons" || typeof v !== "number") continue;
      (c as unknown as Record<string, number>)[k] = ((c as unknown as Record<string, number>)[k] ?? 0) + v;
    }
    if (reason) c.reasons[reason] = (c.reasons[reason] ?? 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* quota — counters are a convenience, the server log is the record */
  }
}

/** Highest-tallied reason, or null. Drives the "most often: too dressy" line. */
export function topReason(c: FeedbackCounters): { key: string; count: number } | null {
  const entries = Object.entries(c.reasons);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { key: entries[0][0], count: entries[0][1] };
}

export const REASON_LABEL: Record<string, string> = {
  too_dressy: "too dressy",
  too_casual: "too casual",
  weather: "wrong for the weather",
  colour: "colours",
  style: "different style",
  variety: "just wanted a change",
  not_it: "just not it",
};

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

function emit(stage: FeedbackStage, payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  void (async () => {
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          type: "engine_feedback",
          payload: { surface: "outfit_engine", stage, ...payload },
        }),
        keepalive: true, // survive the app backgrounding mid-log
      });
    } catch {
      /* swallow — telemetry never breaks UX */
    }
  })();
}

/** The slate identity every later event carries, so outcomes join back to a look. */
function ref(): Record<string, unknown> {
  if (!current) return {};
  const look = current.looks[current.idx];
  return {
    slateId: current.id,
    engine: current.engine,
    slot: look?.slot,
    slotIdx: current.idx,
    itemIds: look?.itemIds,
    subs: look?.subs,
    score: look?.score,
    signals: look?.signals,
  };
}

// ---------------------------------------------------------------------------
// the API the UI calls
// ---------------------------------------------------------------------------

/**
 * The engine just produced a slate. Records provenance for every later event and
 * logs the impression. Call this even for a one-look result — a look nobody saw
 * is not evidence.
 */
export function slateShown(
  looks: ScoredLook[],
  opts: { season?: Season; slotNames: string[] },
): void {
  if (!looks.length) return;
  current = {
    id: sid(),
    // AJA-259: there is only one engine now. The field stays in the payload because
    // the events table already holds v1 rows from the toggle period, and an analysis
    // that groups by it must keep working.
    engine: "v2",
    season: opts.season,
    idx: 0,
    touched: false,
    closed: false,
    looks: looks.map((l, i) => ({
      slot: opts.slotNames[i] ?? `slot${i}`,
      itemIds: l.itemIds,
      subs: l.items.map((it) => sub(it) || it.category),
      score: l.score,
      // Drop undefined values: the v1 signal shape is a subset of v2's and JSON
      // would carry the holes through as nulls that skew any later average.
      signals: Object.fromEntries(
        Object.entries(l.signals).filter(([, v]) => typeof v === "number"),
      ) as Record<string, number>,
    })),
  };
  pendingRemoval = null;
  bump({ shown: 1 });
  emit("shown", {
    slateId: current.id,
    engine: current.engine,
    season: current.season ?? null,
    looks: current.looks,
  });
}

/** The user switched vibe chips. A vote on the MMR lambdas. */
export function slatePicked(i: number): void {
  if (!current || !current.looks[i]) return;
  const from = current.idx;
  current.idx = i;
  bump({ picks: 1 });
  emit("pick", { ...ref(), fromSlot: current.looks[from]?.slot });
}

/** Any board edit that is not part of a swap. Keeps a re-roll from reading as a rejection. */
export function boardTouched(): void {
  if (current) current.touched = true;
}

/**
 * A piece came off the board. Buffered rather than logged: on its own a removal
 * is ambiguous, and it becomes a swap only if a replacement follows.
 */
export function pieceRemoved(item: WardrobeItem, rest: WardrobeItem[]): void {
  if (!current) return;
  current.touched = true;
  pendingRemoval = { item, rest: rest.filter((r) => r.id !== item.id), at: Date.now() };
}

/**
 * A piece went on. If it fills the hole a recent removal left, that is a swap and
 * the diff names the term that misfired.
 */
export function pieceAdded(item: WardrobeItem): SwapReason | null {
  if (current) current.touched = true;
  const p = pendingRemoval;
  if (!p || !current) return null;
  if (p.item.category !== item.category) return null;
  if (Date.now() - p.at > SWAP_WINDOW_MS) {
    pendingRemoval = null;
    return null;
  }
  pendingRemoval = null;
  const reason = inferSwapReason(p.item, item, p.rest, current.season);
  bump({ swaps: 1 }, reason);
  emit("swap", {
    ...ref(),
    reason,
    removedId: p.item.id,
    removedSub: sub(p.item),
    addedId: item.id,
    addedSub: sub(item),
    category: item.category,
  });
  return reason;
}

/**
 * True when the live slate was never engaged with — the caller is about to throw
 * away three looks the user did not touch. Still worth logging as a rejection; it
 * is simply no longer worth interrupting anyone over.
 */
export function isUntouchedSlate(): boolean {
  return !!current && !current.closed && !current.touched;
}

/** Log the rejection, silently. Returns the slate id, or null if already counted. */
export function rerolled(): string | null {
  if (!current || current.closed) return null;
  const id = current.id;
  current.closed = true;
  bump({ rerolls: 1 });
  emit("reroll", { ...ref() });
  return id;
}

/**
 * The user flagged the look currently on the board as bad, and said why.
 *
 * Strictly better data than the old "answer after a re-roll": `ref()` names the
 * exact slot, item ids and signal breakdown that were on screen, so a complaint
 * of "too dressy" can be regressed against the formality score of the specific
 * look that earned it. Deliberately does NOT close the slate — flagging is not
 * rejecting, and you can flag one vibe and then go and wear another.
 */
export function lookFlagged(reason: FlagReason): boolean {
  if (!current) return false;
  bump({ flags: 1 }, reason);
  emit("flag", { ...ref(), reason });
  return true;
}

/**
 * The board was saved. Only counts when the saved look still substantially IS the
 * generated one — otherwise the user rebuilt it by hand and the engine gets no
 * credit. `outfitId` is the join key for a later `worn`.
 */
export function lookKept(outfitId: string, itemIds: string[]): void {
  if (!current || current.closed) return;
  const look = current.looks[current.idx];
  if (!look) return;
  const saved = new Set(itemIds);
  const overlap = look.itemIds.filter((id) => saved.has(id)).length;
  const share = look.itemIds.length ? overlap / look.itemIds.length : 0;
  if (share < 0.5) return;
  current.closed = true;
  bump({ kept: 1 });
  emit("kept", { ...ref(), outfitId, savedIds: itemIds, share: Number(share.toFixed(2)) });
}

/**
 * A look was worn. The strongest positive label there is, and the only one that
 * survives the session — which is why it carries `outfitId` and lets the server
 * join it back to whichever slate produced that outfit.
 */
export function lookWorn(opts: { outfitId?: string; itemIds: string[] }): void {
  if (typeof window === "undefined") return;
  // Not every wear is a look. ItemCard's "worn today" logs ONE loose garment with no
  // outfit — counting that as engine feedback would inflate `worn` and flatter the
  // engine with data it had nothing to do with. A look is a saved outfit, or two or
  // more pieces logged together.
  if (!opts.outfitId && opts.itemIds.length < 2) return;
  bump({ worn: 1 });
  emit("worn", {
    outfitId: opts.outfitId ?? null,
    itemIds: opts.itemIds,
    // Present only when the wear happened in the same session as the suggestion;
    // otherwise the server joins on outfitId against the earlier `kept` row.
    slateId: current?.id ?? null,
    engine: current?.engine ?? null,
  });
}

/** Test seam — reset module memory between cases. Not called by app code. */
export function __resetFeedback(): void {
  current = null;
  pendingRemoval = null;
}
