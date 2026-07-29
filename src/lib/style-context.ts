/**
 * AJA-258 — the one place that decides what "right now" means for the engine.
 *
 * Surprise me and Today read ambient context: whatever the app has guessed about
 * today's weather, plus the occasion from the style quiz. This lets you override
 * that. Two rules shaped the design:
 *
 * 1. It overrides AMBIENT context only, never EXPLICIT context. Calendar's season
 *    comes from the date you tapped and Travel's from the trip — tapping December
 *    3rd is winter no matter what this says, so those screens don't consult it.
 * 2. `resolve` is pure: it takes the override and the cached weather as arguments
 *    rather than reaching into the store or localStorage. That keeps it testable
 *    against real values and keeps the module free of an import cycle with store.ts.
 */
import { STYLE_OCCASIONS } from "./style-quiz";
import type { Season } from "./types";

export const CONTEXT_SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

export interface StyleContext {
  /** "auto" = use the detected weather, i.e. today's behaviour. */
  mode: "auto" | "manual";
  season: Season;
  /** A `StyleOccasion` id ("everyday" | "work" | "nights_out" | …). */
  occasion: string;
  tempC: number;
  needsOuterwear: boolean;
}

export const DEFAULT_STYLE_CONTEXT: StyleContext = {
  mode: "auto",
  season: "summer",
  occasion: "everyday",
  tempC: 22,
  needsOuterwear: false,
};

/** Range the UI slider offers; also the clamp, so a bad persisted value can't escape. */
export const TEMP_MIN = -10;
export const TEMP_MAX = 40;

/**
 * Trust nothing that comes back from persistence. store.ts's `merge` spreads
 * top-level persisted fields straight through without validating them, so a
 * half-written or hand-edited blob would otherwise reach the engine as e.g.
 * `season: "banana"` or `tempC: NaN`. This is the AJA-223/239/244/245 allowlist
 * lesson pointed the other way: there the risk was dropping good fields, here it
 * is accepting bad ones.
 */
export function normalizeStyleContext(
  v: unknown,
  /**
   * What each invalid field falls back TO. The setter passes the current context,
   * so one bad field can't reset the others: without this, patching an invalid
   * season silently reset a perfectly good `winter` to the global default
   * `summer`, which is a worse failure than rejecting the patch. `merge` passes
   * nothing, so a corrupt persisted blob still lands on the defaults.
   */
  base: StyleContext = DEFAULT_STYLE_CONTEXT,
): StyleContext {
  if (!v || typeof v !== "object") return { ...base };
  const o = v as Record<string, unknown>;
  const season = CONTEXT_SEASONS.includes(o.season as Season)
    ? (o.season as Season)
    : base.season;
  const occasion = STYLE_OCCASIONS.some((x) => x.id === o.occasion)
    ? String(o.occasion)
    : base.occasion;
  // Number.isFinite rejects NaN and Infinity, which `typeof === "number"` accepts.
  const tempC = Number.isFinite(o.tempC)
    ? Math.min(TEMP_MAX, Math.max(TEMP_MIN, Math.round(o.tempC as number)))
    : base.tempC;
  return {
    mode: o.mode === "manual" ? "manual" : o.mode === "auto" ? "auto" : base.mode,
    season,
    occasion,
    tempC,
    needsOuterwear: typeof o.needsOuterwear === "boolean" ? o.needsOuterwear : base.needsOuterwear,
  };
}

/** The subset of a weather snapshot `resolve` needs. */
export interface AmbientWeather {
  season: Season;
  tempC?: number | null;
  needsOuterwear?: boolean;
}

export interface ResolvedContext {
  weather: { season: Season; needsOuterwear: boolean; tempC?: number } | null;
  season?: Season;
  occasion?: string;
  /** The matching vibe the occasion maps to, so callers don't repeat the lookup. */
  vibe?: string;
  /** For the UI and for telemetry — never fed to the engine. */
  source: "manual" | "auto" | "none";
}

/**
 * What the engine should be told. `ambient` is `readCachedWeather()`'s result;
 * pass null when there is none (a fresh install, or weather that never resolved —
 * in which case the engine currently gets NO season at all, which is why the
 * seasonal filters go inert and a scarf can turn up in July).
 */
export function resolveStyleContext(
  ctx: StyleContext | undefined,
  ambient: AmbientWeather | null,
  /** Occasion from the style quiz, used only in auto mode. */
  quizOccasion?: string,
): ResolvedContext {
  const c = ctx ?? DEFAULT_STYLE_CONTEXT;
  if (c.mode === "manual") {
    return {
      weather: { season: c.season, needsOuterwear: c.needsOuterwear, tempC: c.tempC },
      season: c.season,
      occasion: c.occasion,
      vibe: STYLE_OCCASIONS.find((o) => o.id === c.occasion)?.vibe,
      source: "manual",
    };
  }
  const occasion = quizOccasion;
  const vibe = STYLE_OCCASIONS.find((o) => o.id === occasion)?.vibe;
  if (!ambient) return { weather: null, occasion, vibe, source: "none" };
  return {
    weather: {
      season: ambient.season,
      needsOuterwear: ambient.needsOuterwear === true,
      tempC: ambient.tempC ?? undefined,
    },
    season: ambient.season,
    occasion,
    vibe,
    source: "auto",
  };
}

/** One-line summary for the Settings row. */
export function describeStyleContext(c: StyleContext): string {
  if (c.mode === "auto") return "Auto";
  const occ = STYLE_OCCASIONS.find((o) => o.id === c.occasion);
  const short = occ ? occ.label.split(" / ")[0] : c.occasion;
  return `${c.season} · ${short} · ${c.tempC}°${c.needsOuterwear ? " · coat" : ""}`;
}
