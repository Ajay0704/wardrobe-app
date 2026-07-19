/**
 * Bidirectional sync between the Zustand store and Supabase.
 * Requires email/password sign-in — no anonymous sessions.
 */

import type { ThemeMode } from "../store";
import { DEFAULT_PROFILE, type UserProfile } from "../profile";
import { scrubSnapshotImages } from "../heal";
import type {
  CalendarEntry,
  Outfit,
  SlotKey,
  WardrobeItem,
} from "../types";
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
  calendar: CalendarEntry[];
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

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Pull the remote snapshot for the current user. */
export async function pullSnapshot(
  userId: string,
): Promise<WardrobeSnapshot | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const columns = [
    "items, outfits, calendar, profile, theme, draft, updated_at",
    "items, outfits, profile, theme, draft, updated_at",
  ];

  let data: Record<string, unknown> | null = null;
  let lastError: string | null = null;

  for (const select of columns) {
    const res = await supabase
      .from("wardrobe_snapshots")
      .select(select)
      .eq("user_id", userId)
      .maybeSingle();
    if (!res.error) {
      data = res.data as Record<string, unknown> | null;
      break;
    }
    lastError = formatSupabaseError(res.error);
    // Only retry on missing-column style errors.
    if (!/column|calendar/i.test(res.error.message)) {
      console.warn("[sync] pull failed:", lastError);
      return null;
    }
  }

  if (!data) {
    if (lastError) console.warn("[sync] pull failed:", lastError);
    return null;
  }

  // Strip poisoned inline images at the edge so callers never hydrate megabytes.
  const raw = {
    items: (data.items as WardrobeItem[]) ?? [],
    outfits: (data.outfits as Outfit[]) ?? [],
    calendar: asArray<CalendarEntry>(data.calendar),
    profile: (data.profile as UserProfile) ?? DEFAULT_PROFILE,
    theme: (data.theme as ThemeMode) ?? "light",
    draft:
      (data.draft as Record<SlotKey, string[]>) ??
      ({} as Record<SlotKey, string[]>),
    updated_at: data.updated_at as string | undefined,
  };

  const scrubbed = scrubSnapshotImages(raw);
  return { ...raw, items: scrubbed.items ?? raw.items, profile: scrubbed.profile ?? raw.profile };
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

/**
 * Merge two item lists by id so a local push cannot wipe pieces the server
 * added while the app was open (e.g. browser extension clips).
 * Same id → prefer `preferred` (usually local edits).
 */
export function mergeItemsById(
  preferred: WardrobeItem[],
  other: WardrobeItem[],
): WardrobeItem[] {
  const preferredIds = new Set(preferred.map((it) => it.id));
  const extras = other.filter((it) => it?.id && !preferredIds.has(it.id));
  return [...preferred, ...extras];
}

function normalizeProductUrl(url: string | undefined): string {
  return (url || "").trim().replace(/\/$/, "");
}

/**
 * Fold in remote wishlist clips (extension / deep-link) without resurrecting
 * wardrobe items the user deleted locally.
 */
export function absorbWishlistClips(
  local: WardrobeItem[],
  remote: WardrobeItem[],
): WardrobeItem[] {
  const localIds = new Set(local.map((it) => it.id));
  const localUrls = new Set(
    local
      .map((it) => normalizeProductUrl(it.productUrl))
      .filter(Boolean),
  );
  const extras = remote.filter((it) => {
    if (!it?.id || !it.wishlist) return false;
    if (localIds.has(it.id)) return false;
    const url = normalizeProductUrl(it.productUrl);
    if (!url) return false;
    if (localUrls.has(url)) return false;
    return true;
  });
  if (!extras.length) return local;
  return [...extras, ...local];
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

  const fullRow = {
    user_id: userId,
    items: clean.items,
    outfits: clean.outfits,
    calendar: clean.calendar,
    profile: clean.profile,
    theme: clean.theme,
    draft: clean.draft,
    updated_at: new Date().toISOString(),
  };

  const size = snapshotCharSize(fullRow);
  if (size > MAX_SNAPSHOT_CHARS) {
    const msg = `Snapshot too large (${Math.round(size / 1024)} KB). Re-upload photos so they go to Storage as URLs, not inline data.`;
    console.warn("[sync] push blocked:", msg);
    return { ok: false, error: msg };
  }

  // Try full row, then drop calendar — so older schemas still sync.
  const attempts: Record<string, unknown>[] = [
    fullRow,
    (() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { calendar: _c, ...rest } = fullRow;
      return rest;
    })(),
  ];

  let lastMsg = "Unknown sync error";
  for (let i = 0; i < attempts.length; i++) {
    const { error } = await supabase.from("wardrobe_snapshots").upsert(attempts[i]);
    if (!error) {
      if (i === 1) {
        console.warn(
          "[sync] calendar column missing — run schema migration to sync Calendar.",
        );
      }
      return { ok: true };
    }
    lastMsg = formatSupabaseError(error);
    if (!/column|calendar/i.test(error.message)) break;
  }

  console.warn("[sync] push failed:", lastMsg);
  return { ok: false, error: lastMsg };
}

export { isSupabaseConfigured };
