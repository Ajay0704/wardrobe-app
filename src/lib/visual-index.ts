/**
 * AJA-301 — the device-local index of image vectors behind Should-I-Buy's "you own
 * something very similar".
 *
 * Kept OUT of the wardrobe store on purpose. Items sync as one JSONB snapshot with a
 * hard 800 KB cap, re-pushed on every edit; 1 KB per piece would eat a quarter of that
 * on a large closet and re-upload it on every change. Here, in its own localStorage key
 * (the taste.ts pattern), vectors cost the snapshot nothing. The price: each device
 * embeds its own copy — about $0.03 for a full closet.
 *
 * Entries are keyed by item id AND a hash of the image embedded, so a vector for an old
 * photo simply stops matching (see makeVisualLookup) — nothing to clean up, no race.
 *
 * Only what the wishlist can use is embedded: every wish, plus owned pieces in a
 * category a wish is in. Triggered when the wishlist or the sheet opens, never in the
 * background. Every way it can fail stops calls rather than repeating them.
 */
import { create } from "zustand";
import { authHeaders } from "./supabase/client";
import type { WardrobeItem } from "./types";
import {
  decodeVector,
  srcHash,
  VISUAL_DIM,
  VISUAL_MODEL,
  visualSource,
  type VisualEntry,
} from "./visual-similarity";

const KEY = "wardrobe-visual-v1";
/** Bump with any change to image prep or vector format: old entries are dropped, never mixed. */
const INDEX_VERSION = 1;
const BATCH = 16;
const CONCURRENCY = 2;
const MAX_QUEUED = 200;
/** A failing image waits 1h, then 6h, then a day — blocked retailers and dead links don't loop. */
const BACKOFF_MS = [60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
const MAX_PAUSE_MS = 60 * 60_000;
const WEEK_MS = 7 * 24 * 60 * 60_000;

interface Fail {
  n: number;
  until: number;
}

export interface VisualIndexState {
  /** itemId → the image hash it was embedded from, and the vector. */
  entries: Record<string, VisualEntry>;
  /** image hash → backoff. */
  fails: Record<string, Fail>;
}

const hasStorage = () => typeof window !== "undefined" && typeof localStorage !== "undefined";
const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** The persisted index, or empty when absent, corrupt, or from another model/format. */
export function loadVisualIndex(): VisualIndexState {
  const empty: VisualIndexState = { entries: {}, fails: {} };
  if (!hasStorage()) return empty;
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!isRecord(p) || p.ver !== INDEX_VERSION || p.model !== VISUAL_MODEL || p.dim !== VISUAL_DIM) return empty;
    return {
      entries: isRecord(p.entries) ? (p.entries as VisualIndexState["entries"]) : {},
      fails: isRecord(p.fails) ? (p.fails as VisualIndexState["fails"]) : {},
    };
  } catch {
    return empty;
  }
}

function save(s: VisualIndexState): void {
  if (!hasStorage()) return;
  try {
    const now = Date.now();
    const fails = Object.fromEntries(Object.entries(s.fails).filter(([, f]) => f.until + WEEK_MS > now));
    localStorage.setItem(KEY, JSON.stringify({ ver: INDEX_VERSION, model: VISUAL_MODEL, dim: VISUAL_DIM, entries: s.entries, fails }));
  } catch {
    /* quota — the vectors are a cache; Should-I-Buy falls back to the heuristic */
  }
}

export const useVisualIndex = create<VisualIndexState>(() => loadVisualIndex());

// Session memory. A slate of work only means something inside the session that queued it.
let generation = 0;
let disabled = false;
let pausedUntil = 0;
let queue: { id: string; src: string; h: string }[] = [];
const queued = new Set<string>();
let worker: Promise<void> | null = null;

/**
 * Forget everything on this device: vectors, backoffs, and the session's off switch or
 * pause. Called on sign-out and reset — and signing back in should work again.
 */
export function clearVisualIndex(): void {
  generation++;
  disabled = false;
  pausedUntil = 0;
  queue = [];
  queued.clear();
  worker = null;
  useVisualIndex.setState({ entries: {}, fails: {} }, true);
  if (hasStorage()) {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  }
}

/**
 * Whether any of `ids` still lacks a vector it can actually get. False when the feature
 * is off or paused, and for pieces that can't be embedded or are backing off — so the
 * sheet never waits on a picture that isn't coming.
 */
export function needsVectors(items: WardrobeItem[], ids: string[]): boolean {
  if (!hasStorage() || disabled || Date.now() < pausedUntil) return false;
  const want = new Set(ids);
  const { entries, fails } = useVisualIndex.getState();
  const now = Date.now();
  return items.some((it) => {
    if (!want.has(it.id)) return false;
    const src = visualSource(it);
    if (!src) return false;
    const h = srcHash(src);
    return entries[it.id]?.h !== h && (fails[h]?.until ?? 0) <= now;
  });
}

/** The pieces whose look the wishlist can use: every wish, and owned pieces in a wished-for category. */
export function visualCandidates(items: WardrobeItem[]): WardrobeItem[] {
  const cats = new Set(items.filter((it) => it.wishlist).map((it) => it.category));
  return items.filter((it) => it.wishlist || cats.has(it.category));
}

/**
 * Embed whatever the wishlist needs and doesn't have yet. `priorityIds` (the open
 * sheet's pieces) jump the queue. One worker at a time: overlapping calls share it, and
 * the promise resolves when it goes idle.
 */
export function ensureVisualVectors(
  items: WardrobeItem[],
  opts: { priorityIds?: string[] } = {},
): Promise<void> {
  if (!hasStorage() || disabled || Date.now() < pausedUntil) return worker ?? Promise.resolve();
  prune(items);
  const { entries, fails } = useVisualIndex.getState();
  const now = Date.now();
  const prio = new Set(opts.priorityIds ?? []);
  const first: typeof queue = [];
  const rest: typeof queue = [];
  for (const it of visualCandidates(items)) {
    const src = visualSource(it);
    if (!src) continue;
    const h = srcHash(src);
    if (entries[it.id]?.h === h || (fails[h]?.until ?? 0) > now) continue;
    const key = `${it.id}|${h}`;
    if (queued.has(key)) {
      if (prio.has(it.id)) {
        const at = queue.findIndex((q) => q.id === it.id && q.h === h);
        if (at > 0) first.push(...queue.splice(at, 1));
      }
      continue;
    }
    if (queue.length + first.length + rest.length >= MAX_QUEUED) break;
    queued.add(key);
    (prio.has(it.id) ? first : rest).push({ id: it.id, src, h });
  }
  queue = [...first, ...queue, ...rest];
  if (!worker && queue.length) {
    const gen = generation;
    worker = run(gen).finally(() => {
      if (gen === generation) worker = null;
    });
  }
  return worker ?? Promise.resolve();
}

/** Drop vectors for pieces that no longer exist. Skipped for an empty closet (not yet hydrated). */
function prune(items: WardrobeItem[]): void {
  if (!items.length) return;
  const live = new Set(items.map((it) => it.id));
  const { entries } = useVisualIndex.getState();
  const dead = Object.keys(entries).filter((id) => !live.has(id));
  if (!dead.length) return;
  const next = { ...entries };
  for (const id of dead) delete next[id];
  useVisualIndex.setState({ entries: next });
  save(useVisualIndex.getState());
}

async function run(gen: number): Promise<void> {
  while (queue.length && gen === generation && !disabled && Date.now() >= pausedUntil) {
    const batches: (typeof queue)[] = [];
    for (let i = 0; i < CONCURRENCY && queue.length; i++) batches.push(queue.splice(0, BATCH));
    await Promise.all(batches.map((b) => send(b, gen)));
  }
  // Stopped by an off switch or a pause: release what's left so a later visit can retry.
  if (gen === generation) {
    for (const q of queue) queued.delete(`${q.id}|${q.h}`);
    queue = [];
  }
}

async function send(batch: typeof queue, gen: number): Promise<void> {
  const release = () => batch.forEach((q) => queued.delete(`${q.id}|${q.h}`));
  let res: Response;
  try {
    res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ items: batch.map(({ id, src }) => ({ id, src })) }),
    });
  } catch {
    if (gen === generation) backOff(batch.map((q) => q.h));
    release();
    return;
  }
  if (gen !== generation) return;
  if (res.status === 401 || res.status === 403 || res.status === 501) {
    disabled = true; // signed out, or not configured: nothing a retry can fix this session
    release();
    return;
  }
  if (res.status === 429) {
    const secs = Number(res.headers.get("retry-after"));
    pausedUntil = Date.now() + Math.min(MAX_PAUSE_MS, Number.isFinite(secs) && secs > 0 ? secs * 1000 : 60_000);
    release();
    return;
  }
  let results: unknown = null;
  try {
    results = res.ok ? (await res.json())?.results : null;
  } catch {
    results = null;
  }
  const byId = new Map<string, unknown>(
    Array.isArray(results)
      ? results.filter(isRecord).map((r) => [String(r.id), r.vector] as [string, unknown])
      : [],
  );
  if (gen !== generation) return;
  const { entries, fails } = useVisualIndex.getState();
  const nextEntries = { ...entries };
  const nextFails = { ...fails };
  const failed: string[] = [];
  for (const q of batch) {
    const v = byId.get(q.id);
    if (typeof v === "string" && decodeVector(v)) {
      // Stored with the hash it was SENT with: if the photo changed meanwhile, the lookup
      // won't match it, and the next visit embeds the new one.
      nextEntries[q.id] = { h: q.h, v };
      delete nextFails[q.h];
    } else failed.push(q.h);
  }
  useVisualIndex.setState({ entries: nextEntries, fails: nextFails });
  if (failed.length) backOff(failed);
  else save(useVisualIndex.getState());
  release();
}

function backOff(hashes: string[]): void {
  const now = Date.now();
  const fails = { ...useVisualIndex.getState().fails };
  for (const h of hashes) {
    const n = (fails[h]?.n ?? 0) + 1;
    fails[h] = { n, until: now + BACKOFF_MS[Math.min(n, BACKOFF_MS.length) - 1] };
  }
  useVisualIndex.setState({ fails });
  save(useVisualIndex.getState());
}
