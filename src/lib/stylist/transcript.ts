/**
 * Stylist transcript persistence — localStorage only, per user.
 *
 * Deliberately NOT part of the zustand store: the transcript never belongs in
 * the Supabase state snapshot, and it's non-critical (safe to lose). All access
 * is guarded for SSR and privacy-mode throwing (mirrors hasStoredSession).
 */

import type { StylistTurn } from "./types";

const KEY = (userId: string | null | undefined) => `stylist-thread-v1:${userId ?? "guest"}`;
const MAX_TURNS = 40;

export function loadTranscript(userId: string | null | undefined): StylistTurn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StylistTurn[]) : [];
  } catch {
    return [];
  }
}

export function saveTranscript(userId: string | null | undefined, turns: StylistTurn[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = turns.slice(-MAX_TURNS);
    window.localStorage.setItem(KEY(userId), JSON.stringify(trimmed));
  } catch {
    /* storage full / disabled — transcript is non-critical, ignore */
  }
}

export function clearTranscript(userId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(userId));
  } catch {
    /* ignore */
  }
}
