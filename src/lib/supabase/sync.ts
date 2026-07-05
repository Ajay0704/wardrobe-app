/**
 * Bidirectional sync between the Zustand store and Supabase.
 *
 * Uses anonymous auth (one wardrobe per browser session). Upgrade to email
 * auth later for cross-device sync — the schema stays the same.
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

/** Ensure the user has an anonymous Supabase session. */
export async function ensureAuth(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user.id) return sessionData.session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) return null;
  return data.user.id;
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

  if (error || !data) return null;
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

  return !error;
}

export { isSupabaseConfigured };
