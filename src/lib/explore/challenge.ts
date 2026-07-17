import type { CalendarEntry } from "@/lib/types";

/**
 * Explore "This week's challenge" + "Shop — honest picks" helpers (AJA-168).
 * Everything here is real and deterministic — the weekly prompt rotates by ISO
 * week (so every user sees the same one), the streak is computed from the user's
 * own wear log, and the color family is derived from what's actually in the closet.
 * No fabricated engagement numbers.
 */

export interface StyleChallenge {
  id: string;
  title: string;
  prompt: string;
}

// Curated rotating prompts — one per ISO week. Editorial content, not user data.
const CHALLENGES: StyleChallenge[] = [
  { id: "monochrome", title: "Monochrome, one color head-to-toe", prompt: "Build a look in a single color family." },
  { id: "denim", title: "Denim on denim", prompt: "Double up your denim, top and bottom." },
  { id: "three-ways", title: "One piece, three ways", prompt: "Style the same hero item three different ways." },
  { id: "neutrals", title: "Quiet neutrals", prompt: "Cream, camel, stone — nothing loud." },
  { id: "pop", title: "One bold pop", prompt: "Neutral base, one bright accent." },
  { id: "layers", title: "Master the layers", prompt: "Three visible layers, styled clean." },
  { id: "dress-up", title: "Dress it up", prompt: "Take a daytime piece somewhere fancy." },
  { id: "oldest", title: "Rewear your oldest piece", prompt: "Style the item you've owned the longest." },
];

/** Standard ISO-8601 week ordinal — used to advance the challenge every week. */
function weekIndex(d: Date): number {
  const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return day.getUTCFullYear() * 53 + week;
}

/** Deterministic weekly pick — everyone sees the same challenge this week. */
export function challengeOfWeek(now = new Date()): StyleChallenge {
  return CHALLENGES[weekIndex(now) % CHALLENGES.length];
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Start of the current week (Monday, local) as an ISO timestamp — for counting entries. */
export function weekStartISO(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() || 7; // Mon=1 … Sun=7
  d.setDate(d.getDate() - (dow - 1));
  return d.toISOString();
}

/**
 * Consecutive-day wear-log streak, counting back from today. Today may be
 * unlogged (the streak still counts from yesterday), so the number reflects an
 * active habit rather than punishing a not-yet-logged day.
 */
export function wearStreak(calendar: CalendarEntry[], now = new Date()): number {
  const worn = new Set(calendar.filter((e) => e.kind === "worn").map((e) => e.date));
  if (worn.size === 0) return 0;
  const cur = new Date(now);
  cur.setHours(0, 0, 0, 0);
  if (!worn.has(isoDay(cur))) cur.setDate(cur.getDate() - 1); // today is optional
  let streak = 0;
  while (worn.has(isoDay(cur))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

const FAMILIES: { label: string; keys: string[] }[] = [
  { label: "earth tones", keys: ["beige", "cream", "tan", "camel", "brown", "olive", "rust", "khaki", "burgundy", "sand", "taupe"] },
  { label: "warm tones", keys: ["red", "orange", "yellow", "pink", "coral"] },
  { label: "cool tones", keys: ["blue", "navy", "teal", "green", "purple", "lavender"] },
  { label: "neutrals", keys: ["black", "white", "grey", "gray", "charcoal", "stone", "ivory"] },
];

/** Dominant color family across a set of color names (for the "you wear a lot of…" line). */
export function colorFamily(colorNames: string[]): string | null {
  if (colorNames.length === 0) return null;
  const score = new Map<string, number>();
  for (const raw of colorNames) {
    const c = raw.toLowerCase();
    const fam = FAMILIES.find((f) => f.keys.some((k) => c.includes(k)));
    if (fam) score.set(fam.label, (score.get(fam.label) ?? 0) + 1);
  }
  const top = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}
