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
import { nameColor } from "../color";

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

/**
 * Result of a snapshot pull, distinguishing a brand-new account ("empty") from
 * a transient/real failure ("error"). Callers must NOT treat "error" like
 * "empty" — doing so would let a failed read overwrite a real remote closet.
 */
export type SnapshotResult =
  | { status: "found"; snapshot: WardrobeSnapshot }
  | { status: "empty" }
  | { status: "error"; error: string };

export async function fetchSnapshot(userId: string): Promise<SnapshotResult> {
  const supabase = getSupabase();
  if (!supabase)
    return { status: "error", error: "Cloud sync is not configured." };

  const columns = [
    "items, outfits, calendar, profile, theme, draft, updated_at",
    "items, outfits, profile, theme, draft, updated_at",
  ];

  let data: Record<string, unknown> | null = null;
  let ok = false;
  let lastError: string | null = null;

  for (const select of columns) {
    const res = await supabase
      .from("wardrobe_snapshots")
      .select(select)
      .eq("user_id", userId)
      .maybeSingle();
    if (!res.error) {
      data = res.data as Record<string, unknown> | null;
      ok = true;
      break;
    }
    lastError = formatSupabaseError(res.error);
    // Only retry on missing-column style errors; anything else is a real error.
    if (!/column|calendar/i.test(res.error.message)) {
      console.warn("[sync] pull failed:", lastError);
      return { status: "error", error: lastError };
    }
  }

  if (!ok) {
    const error = lastError ?? "Snapshot query failed.";
    console.warn("[sync] pull failed:", error);
    return { status: "error", error };
  }

  // Query succeeded but no row → brand-new account.
  if (!data) return { status: "empty" };

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
  return {
    status: "found",
    snapshot: {
      ...raw,
      items: scrubbed.items ?? raw.items,
      profile: scrubbed.profile ?? raw.profile,
    },
  };
}

/** Pull the remote snapshot for the current user, or null if none / on error. */
export async function pullSnapshot(
  userId: string,
): Promise<WardrobeSnapshot | null> {
  const r = await fetchSnapshot(userId);
  return r.status === "found" ? r.snapshot : null;
}

/**
 * Strip oversized / HEIC data-URLs so a poisoned local store can't re-bloat the DB.
 *
 * AJA-276: also runs the path-shape scrubber. `flushPush` reads the store directly
 * rather than going through `partialize`, so for the path-shaped fields
 * (`profile.tryOnPhotoPath`, `outfits[].tryOnRenderPath`) this is the ONLY gate
 * between memory and Postgres — and `updateProfile` can write the profile without
 * any validation at all. Exported for the round-trip test.
 */
export function sanitizeSnapshotForPush(
  snapshot: Omit<WardrobeSnapshot, "updated_at">,
): {
  snapshot: Omit<WardrobeSnapshot, "updated_at">;
  stripped: number;
} {
  let stripped = 0;
  // Scrub FIRST, then the data-URL logic below, so `stripped` keeps meaning
  // "inline images dropped" rather than counting path rejections too.
  snapshot = scrubSnapshotImages(snapshot);
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

/* ------------------------------------------------ wishlist inbox (AJA-241) */

/**
 * A saved-but-not-yet-absorbed row from `wishlist_items`.
 *
 * That table was written by /api/wishlist and read by nothing, so every heart tapped
 * on a shop result or a detected garment vanished. It's now an inbox the client
 * drains into its own snapshot.
 */
export interface WishlistInboxRow {
  id: string;
  kind: string;
  name: string | null;
  category: string | null;
  image_url: string | null;
  product_url: string | null;
  price_cents: number | null;
  currency: string | null;
  color: string | null;
  source_ref: string | null;
  created_at: string;
}

const INBOX_COLS =
  "id,kind,name,category,image_url,product_url,price_cents,currency,color,source_ref,created_at";

/** Un-absorbed saves for the signed-in user, oldest first. RLS scopes this. */
export async function fetchWishlistInbox(limit = 50): Promise<WishlistInboxRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("wishlist_items")
    .select(INBOX_COLS)
    .is("consumed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as WishlistInboxRow[];
}

/**
 * Mark rows absorbed. This is what stops a save the user has since DELETED from
 * reappearing on the next sync — the hazard absorbWishlistClips still has, which it
 * only works around by matching normalized product URLs.
 */
export async function markWishlistInboxConsumed(ids: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !ids.length) return;
  await supabase
    .from("wishlist_items")
    .update({ consumed_at: new Date().toISOString() })
    .in("id", ids);
}

/**
 * Inbox rows -> wishlist items, skipping anything already present locally.
 *
 * Dedupes on the row id (which becomes the item id) AND on normalized product URL, so
 * re-running this after a failed consume marking can't create a duplicate. Rows with
 * no usable image are dropped: the wishlist is a visual grid and a blank card is worse
 * than a missing one.
 */
export function inboxToItems(
  rows: WishlistInboxRow[],
  local: WardrobeItem[],
): WardrobeItem[] {
  const localIds = new Set(local.map((it) => it.id));
  const localUrls = new Set(
    local.map((it) => normalizeProductUrl(it.productUrl)).filter(Boolean),
  );
  const out: WardrobeItem[] = [];
  for (const r of rows) {
    if (!r.id || localIds.has(r.id)) continue;
    if (!r.image_url) continue;
    const url = normalizeProductUrl(r.product_url ?? undefined);
    if (url && localUrls.has(url)) continue;
    const category = (WISHLIST_CATEGORIES as readonly string[]).includes(r.category ?? "")
      ? (r.category as WardrobeItem["category"])
      : "top";
    out.push({
      id: r.id,
      name: r.name?.trim() || "Saved item",
      imageUrl: r.image_url,
      category,
      // A real colour when the server managed to resolve one (AJA-243). The
      // placeholder means "unknown" and is deliberately inert for duplicate
      // detection — see similarColor in smart-buy.ts.
      color: r.color || "#a8a29e",
      colorName: r.color ? nameColor(r.color) : undefined,
      tags: [],
      seasons: [],
      wishlist: true,
      favorite: false,
      price: typeof r.price_cents === "number" ? r.price_cents / 100 : undefined,
      productUrl: r.product_url ?? undefined,
      createdAt: new Date(r.created_at).getTime() || Date.now(),
    });
    localIds.add(r.id);
    if (url) localUrls.add(url);
  }
  return out;
}

/** The shop taxonomy and WardrobeItem["category"] happen to match exactly. */
const WISHLIST_CATEGORIES = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "bag",
  "accessory",
] as const;

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
