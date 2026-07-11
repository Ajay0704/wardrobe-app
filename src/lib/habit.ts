/**
 * Privacy-first weekly habit counters (local only).
 * Tracks opens / outfits created / wears for the current ISO week —
 * the retention signal for AJA-36 without sending data to a server.
 */

const STORAGE_KEY = "wardrobe:habit-v1";

export type HabitWeek = {
  /** e.g. "2026-W28" */
  weekId: string;
  /** Distinct days the app was opened this week */
  visits: number;
  outfitsCreated: number;
  wearsLogged: number;
  /** YYYY-MM-DD of last recorded open (dedupe same-day opens) */
  lastOpenDate?: string;
};

function todayISO(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** ISO week id (UTC), e.g. 2026-W28 */
export function currentWeekId(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function emptyWeek(weekId = currentWeekId()): HabitWeek {
  return { weekId, visits: 0, outfitsCreated: 0, wearsLogged: 0 };
}

export function readHabitWeek(): HabitWeek {
  if (typeof window === "undefined") return emptyWeek();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWeek();
    const parsed = JSON.parse(raw) as HabitWeek;
    const weekId = currentWeekId();
    if (!parsed || parsed.weekId !== weekId) return emptyWeek(weekId);
    return {
      weekId,
      visits: Number(parsed.visits) || 0,
      outfitsCreated: Number(parsed.outfitsCreated) || 0,
      wearsLogged: Number(parsed.wearsLogged) || 0,
      lastOpenDate: parsed.lastOpenDate,
    };
  } catch {
    return emptyWeek();
  }
}

function writeHabitWeek(week: HabitWeek): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(week));
  } catch {
    /* private mode / quota */
  }
}

/** One visit credit per calendar day. */
export function recordAppOpen(): HabitWeek {
  const week = readHabitWeek();
  const today = todayISO();
  if (week.lastOpenDate !== today) {
    week.visits += 1;
    week.lastOpenDate = today;
    writeHabitWeek(week);
  }
  return week;
}

export function recordOutfitCreated(): HabitWeek {
  const week = readHabitWeek();
  week.outfitsCreated += 1;
  writeHabitWeek(week);
  return week;
}

export function recordWearLogged(): HabitWeek {
  const week = readHabitWeek();
  week.wearsLogged += 1;
  writeHabitWeek(week);
  return week;
}

/** Soft score: days opened + outfits + wears this week. */
export function habitScore(week: HabitWeek = readHabitWeek()): number {
  return week.visits + week.outfitsCreated + week.wearsLogged;
}

export function habitLabel(week: HabitWeek = readHabitWeek()): string {
  const parts: string[] = [];
  parts.push(`${week.visits} day${week.visits === 1 ? "" : "s"} back`);
  if (week.outfitsCreated) {
    parts.push(
      `${week.outfitsCreated} outfit${week.outfitsCreated === 1 ? "" : "s"}`,
    );
  }
  if (week.wearsLogged) {
    parts.push(`${week.wearsLogged} wear${week.wearsLogged === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
