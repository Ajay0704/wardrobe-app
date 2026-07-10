/**
 * Bidirectional sync between the Zustand store and Supabase.
 * Requires email/password sign-in — no anonymous sessions.
 */

import type { ThemeMode } from "../store";
import { DEFAULT_PROFILE, type UserProfile } from "../profile";
import type { Outfit, SlotKey, Trip, WardrobeItem } from "../types";
import { getSupabase, isSupabaseConfigured } from "./client";

export type SyncStatus = "offline" | "connecting" | "synced" | "syncing" | "error";

export interface WardrobeSnapshot {
  items: WardrobeItem[];
  outfits: Outfit[];
  trips: Trip[];
  profile: UserProfile;
  theme: ThemeMode;
  draft: Record<SlotKey, string[]>;
  updated_at?: string;
}

/** Pull the remote snapshot for the current user. */
export async function pullSnapshot(
  userId: string,
): Promise<WardrobeSnapshot | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // Prefer the full select (incl. trips). Fall back if the column isn't migrated yet.
  let data: Record<string, unknown> | null = null;
  {
    const full = await supabase
      .from("wardrobe_snapshots")
      .select("items, outfits, trips, profile, theme, draft, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (full.error && /trips/i.test(full.error.message)) {
      const legacy = await supabase
        .from("wardrobe_snapshots")
        .select("items, outfits, profile, theme, draft, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (legacy.error) {
        console.warn("[sync] pull failed:", legacy.error.message);
        return null;
      }
      data = legacy.data as Record<string, unknown> | null;
    } else if (full.error) {
      console.warn("[sync] pull failed:", full.error.message);
      return null;
    } else {
      data = full.data as Record<string, unknown> | null;
    }
  }

  if (!data) return null;
  return {
    items: (data.items as WardrobeItem[]) ?? [],
    outfits: (data.outfits as Outfit[]) ?? [],
    trips: Array.isArray(data.trips) ? (data.trips as Trip[]) : [],
    profile: (data.profile as UserProfile) ?? DEFAULT_PROFILE,
    theme: (data.theme as ThemeMode) ?? "light",
    draft: (data.draft as Record<SlotKey, string[]>) ?? ({} as Record<SlotKey, string[]>),
    updated_at: data.updated_at as string | undefined,
  };
}

/** Push local state to Supabase (upsert). */
export async function pushSnapshot(
  userId: string,
  snapshot: Omit<WardrobeSnapshot, "updated_at">,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const row = {
    user_id: userId,
    items: snapshot.items,
    outfits: snapshot.outfits,
    trips: snapshot.trips,
    profile: snapshot.profile,
    theme: snapshot.theme,
    draft: snapshot.draft,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("wardrobe_snapshots").upsert(row);
  if (!error) return true;

  // Pre-migration DBs lack the trips column — push without it so sync still works.
  if (/trips/i.test(error.message)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { trips: _omit, ...legacy } = row;
    const retry = await supabase.from("wardrobe_snapshots").upsert(legacy);
    if (retry.error) console.warn("[sync] push failed:", retry.error.message);
    else console.warn("[sync] trips column missing — run schema migration to sync Travel.");
    return !retry.error;
  }

  console.warn("[sync] push failed:", error.message);
  return false;
}

export { isSupabaseConfigured };
