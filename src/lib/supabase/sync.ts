/**
 * Bidirectional sync between the Zustand store and Supabase.
 * Requires email/password sign-in — no anonymous sessions.
 */

import type { ThemeMode } from "../store";
import { DEFAULT_PROFILE, type UserProfile } from "../profile";
import type { Outfit, SlotKey, WardrobeItem } from "../types";
import { getSupabase, isSupabaseConfigured } from "./client";

export type SyncStatus = "offline" | "connecting" | "synced" | "syncing" | "error";

export interface WardrobeSnapshot {
  items: WardrobeItem[];
  outfits: Outfit[];
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

  const { data, error } = await supabase
    .from("wardrobe_snapshots")
    .select("items, outfits, profile, theme, draft, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[sync] pull failed:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    ...(data as WardrobeSnapshot),
    profile: (data.profile as UserProfile) ?? DEFAULT_PROFILE,
  };
}

/** Push local state to Supabase (upsert). */
export async function pushSnapshot(
  userId: string,
  snapshot: Omit<WardrobeSnapshot, "updated_at">,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase.from("wardrobe_snapshots").upsert({
    user_id: userId,
    items: snapshot.items,
    outfits: snapshot.outfits,
    profile: snapshot.profile,
    theme: snapshot.theme,
    draft: snapshot.draft,
    updated_at: new Date().toISOString(),
  });

  if (error) console.warn("[sync] push failed:", error.message);
  return !error;
}

export { isSupabaseConfigured };
