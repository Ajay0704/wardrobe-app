/**
 * Bidirectional sync between the Zustand store and Supabase.
 * Requires email/password sign-in — no anonymous sessions.
 */

import type { ThemeMode } from "../store";
import { DEFAULT_PROFILE, type UserProfile } from "../profile";
import type { Outfit, SlotKey, Trip, WardrobeItem } from "../types";
import { getSupabase, isSupabaseConfigured } from "./client";

export type SyncStatus =
  | "offline"
  | "connecting"
  | "synced"
  | "syncing"
  | "error";

export interface WardrobeSnapshot {
  items: WardrobeItem[];
  outfits: Outfit[];
  trips: Trip[];
  profile: UserProfile;
  theme: ThemeMode;
  draft: Record<SlotKey, string[]>;
  updated_at?: string;
}

export type SyncResult = { ok: true } | { ok: false; error: string };

const DATA_URL_RE = /^data:/i;
/** Soft cap — PostgREST/CF often struggle well before Postgres does. */
const MAX_SNAPSHOT_CHARS = 800_000;

function isDataUrl(v: unknown): v is string {
  return typeof v === "string" && DATA_URL_RE.test(v);
}

/** Explain why a snapshot will fail to sync (base64 bloat / HEIC, etc.). */
export function diagnoseSnapshot(snapshot: {
  items: WardrobeItem[];
  profile: UserProfile;
}): string | null {
  let totalChars = 0;
  let count = 0;
  let heic = false;

  const note = (url: string) => {
    totalChars += url.length;
    count += 1;
    if (/image\/hei[cf]/i.test(url)) heic = true;
  };

  if (isDataUrl(snapshot.profile.avatarUrl)) note(snapshot.profile.avatarUrl!);
  for (const it of snapshot.items) {
    if (isDataUrl(it.imageUrl)) note(it.imageUrl);
  }

  if (!count) return null;

  if (heic) {
    return "Sync blocked: a HEIC photo is embedded inline. Re-upload as JPEG/PNG (Settings → photo, then edit the item).";
  }
  // Small compressed data URLs (~100KB) are tolerable; multi-MB blobs are not.
  if (totalChars > 200_000) {
    return `Sync blocked: ${count} inline image${count > 1 ? "s" : ""} totaling ${Math.round(totalChars / 1024)} KB. Re-upload those photos while signed in so they go to Storage.`;
  }
  return null;
}

function snapshotCharSize(row: Record<string, unknown>): number {
  try {
    return JSON.stringify(row).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function formatSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  const bits = [error.message, error.code && `code ${error.code}`, error.details, error.hint]
    .filter(Boolean)
    .join(" — ");
  return bits || "Unknown sync error";
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
        console.warn("[sync] pull failed:", formatSupabaseError(legacy.error));
        return null;
      }
      data = legacy.data as Record<string, unknown> | null;
    } else if (full.error) {
      console.warn("[sync] pull failed:", formatSupabaseError(full.error));
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
    draft:
      (data.draft as Record<SlotKey, string[]>) ??
      ({} as Record<SlotKey, string[]>),
    updated_at: data.updated_at as string | undefined,
  };
}

/** Strip oversized / HEIC data-URLs so a poisoned local store can't re-bloat the DB. */
function sanitizeSnapshotForPush(
  snapshot: Omit<WardrobeSnapshot, "updated_at">,
): {
  snapshot: Omit<WardrobeSnapshot, "updated_at">;
  stripped: number;
} {
  let stripped = 0;
  const scrub = (url: string | undefined): string | undefined => {
    if (!isDataUrl(url)) return url;
    if (/image\/hei[cf]/i.test(url) || url.length > 200_000) {
      stripped += 1;
      return undefined;
    }
    return url;
  };

  const avatarUrl = scrub(snapshot.profile.avatarUrl);
  const profile: UserProfile = { ...snapshot.profile };
  if (avatarUrl) profile.avatarUrl = avatarUrl;
  else delete profile.avatarUrl;

  const items = snapshot.items.map((it) => {
    if (!isDataUrl(it.imageUrl)) return it;
    if (/image\/hei[cf]/i.test(it.imageUrl) || it.imageUrl.length > 200_000) {
      stripped += 1;
      return { ...it, imageUrl: "" };
    }
    return it;
  });

  return {
    snapshot: { ...snapshot, profile, items },
    stripped,
  };
}

/** Push local state to Supabase (upsert). Returns a structured result with the real error. */
export async function pushSnapshot(
  userId: string,
  snapshot: Omit<WardrobeSnapshot, "updated_at">,
): Promise<SyncResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { snapshot: clean, stripped } = sanitizeSnapshotForPush(snapshot);
  if (stripped > 0) {
    console.warn(
      `[sync] stripped ${stripped} oversized/HEIC inline image(s) before push — re-upload as JPEG/PNG`,
    );
  }

  const diagnosis = diagnoseSnapshot(clean);
  if (diagnosis) {
    console.warn("[sync] push blocked:", diagnosis);
    return { ok: false, error: diagnosis };
  }

  const row = {
    user_id: userId,
    items: clean.items,
    outfits: clean.outfits,
    trips: clean.trips,
    profile: clean.profile,
    theme: clean.theme,
    draft: clean.draft,
    updated_at: new Date().toISOString(),
  };

  const size = snapshotCharSize(row);
  if (size > MAX_SNAPSHOT_CHARS) {
    const msg = `Snapshot too large (${Math.round(size / 1024)} KB). Re-upload photos so they go to Storage as URLs, not inline data.`;
    console.warn("[sync] push blocked:", msg);
    return { ok: false, error: msg };
  }

  const { error } = await supabase.from("wardrobe_snapshots").upsert(row);
  if (!error) return { ok: true };

  // Pre-migration DBs lack the trips column — push without it so sync still works.
  if (/trips/i.test(error.message)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { trips: _omit, ...legacy } = row;
    const retry = await supabase.from("wardrobe_snapshots").upsert(legacy);
    if (retry.error) {
      const msg = formatSupabaseError(retry.error);
      console.warn("[sync] push failed:", msg);
      return { ok: false, error: msg };
    }
    console.warn(
      "[sync] trips column missing — run schema migration to sync Travel.",
    );
    return { ok: true };
  }

  const msg = formatSupabaseError(error);
  console.warn("[sync] push failed:", msg);
  return { ok: false, error: msg };
}

export { isSupabaseConfigured };
