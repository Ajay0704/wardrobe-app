"use client";

/**
 * Global app state, persisted to localStorage via zustand's persist
 * middleware. To move to Supabase/Firebase later, replace the storage
 * adapter (or sync in a subscribe callback) — component code is unaffected.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FIT_VALUES, type Fit } from "./types";
import type {
  CalendarEntry,
  Category,
  Outfit,
  Season,
  SlotKey,
  WardrobeItem,
  CanvasItem,
} from "./types";
import { SLOT_CONFIG, slotForCategory, todayISO } from "./types";
import { inferSubcategory, migrateSubcategory } from "./subcategory";
import type { AnalyzedAttrs } from "./analyze-attrs";
import { isSampleItem, sampleCloset } from "./demo-data";
import {
  DEFAULT_PROFILE,
  resolveStartView,
  type AuthUser,
  type SettingsSection,
  type UserProfile,
} from "./profile";
import type { SyncStatus } from "./supabase/sync";
import { scrubSnapshotImages } from "./heal";
import { isRenderPath } from "./supabase/private-storage";
import { recordOutfitCreated, recordWearLogged } from "./habit";
import { DEFAULT_STYLE_CONTEXT, normalizeStyleContext, type StyleContext } from "./style-context";
import { lookWorn } from "./engine-feedback";

export type ThemeMode = "light" | "dark";

/** Background photo-import progress (AJA-236/237). Transient UI state — never persisted. */
export interface ImportStatus {
  /** "extract" = detecting garments from photos; "commit" = adding reviewed picks (w/ beautify);
   *  "backfill" = re-reading existing items' photos to fill missing attributes (AJA-247). */
  phase: "extract" | "commit" | "backfill";
  /** Units enqueued this run (photos while extracting, picks while committing). */
  total: number;
  /** Units finished (success or failure). */
  done: number;
  /** Photos that yielded no items / errored. */
  failed: number;
  /** Garments added to the closet so far (commit phase), or items updated (backfill phase). */
  itemsAdded: number;
  /** True while the queue is still draining. */
  running: boolean;
}

/** A detected garment awaiting the user's review before it's added to the closet (AJA-237).
 *  Its cutout is already re-hosted to Storage, so `cutoutUrl` is a valid `beautify()` input. */
export interface PendingImport extends AnalyzedAttrs {
  id: string;
  cutoutUrl: string;
  name: string;
  category: Category;
  color: string;
  colorName?: string;
  tags: string[];
  seasons: Season[];
  /** Which background remover produced `cutoutUrl`. Carried through to the item so the closet
   *  records what made each image — see the note on `DetectedGarment.cutoutEngine` (AJA-273). */
  cutoutEngine?: string;
}

export type View =
  | "today"
  | "wardrobe"
  | "builder"
  | "outfits"
  | "calendar"
  | "wishlist"
  | "travel"
  | "insights"
  | "you"
  | "explore"
  | "profile"
  | "fitSizes"
  | "styleTaste"
  | "settingsApp"
  | "settingsAccount"
  | "social"
  | "userProfile"
  | "settings"
  | "notifications"
  | "messages"
  | "chat"
  | "stylist"
  | "outfitDetail"
  | "styleSession"
  | "photoDetail";

/** An Explore tile the user tapped through to the photo-detail screen. */
export interface PhotoCard {
  id: string;
  image: string;
  title?: string;
}

export interface Filters {
  search: string;
  category: Category | "all";
  season: Season | "all";
  tag: string | "all";
}

const emptyDraft = (): Record<SlotKey, string[]> => ({
  top: [],
  bottom: [],
  dress: [],
  outerwear: [],
  shoes: [],
  accessories: [],
});

interface WardrobeState {
  items: WardrobeItem[];
  outfits: Outfit[];
  calendar: CalendarEntry[];
  profile: UserProfile;
  authUser: AuthUser | null;
  /** False until the initial Supabase session check resolves (gates the UI). */
  authChecked: boolean;
  syncStatus: SyncStatus;
  /** Last sync failure message — shown on the SyncBadge when status is error. */
  syncError: string | null;
  /** Background photo-import progress (AJA-236); null when idle. Transient — NOT persisted. */
  importStatus: ImportStatus | null;
  /** Detected garments awaiting review before they're added to the closet (AJA-237). Transient. */
  pendingImports: PendingImport[];
  /** True while the import review sheet is open (AJA-237). Transient. */
  importReviewOpen: boolean;
  /** True while a password-recovery link is active (set-new-password flow). */
  passwordRecovery: boolean;
  theme: ThemeMode;
  view: View;
  photoCard: PhotoCard | null;
  /** Conversation currently open in the chat view. */
  activeThreadId: string | null;
  /** One-shot message to auto-send when the Stylist thread opens (transient). */
  stylistSeed: string | null;
  /** User whose profile the "userProfile" view is showing. */
  viewUserId: string | null;
  /** Which section the Settings view opens to. */
  settingsSection: SettingsSection;
  /** Global "add item" modal (opened from the center Create button). */
  addOpen: boolean;
  wishlistAddOpen: boolean;
  /** Which input the add form should jump to when opened from a "+" row. */
  addIntent: "camera" | "upload" | "link" | null;
  /** Global "import from photos" (bulk) modal, opened from Create / Closet. */
  bulkOpen: boolean;
  /** Native "add" sheet (Take photos / Photo library / Paste a link) — shared by the
   *  tab-bar center "+" and the closet "+" so both add entry points behave identically. */
  addSheetOpen: boolean;
  /** Global "add whole outfit" (multi-garment split) modal. */
  splitOpen: boolean;
  scanOpen: boolean;
  /** Which source the split flow should auto-trigger (camera vs library). */
  splitSource: "camera" | "library" | null;
  /** Which source the multi-photo scan flow should auto-trigger (camera vs library). */
  scanSource: "camera" | "library" | null;
  /** Global "closets selector" sheet (opened from the Closet header dropdown). */
  closetsOpen: boolean;
  /** A product URL shared into the app (iOS Share Extension / Web Share Target) to
   *  quick-save to the wishlist. ClipLinkLoader consumes it, then clears it. */
  pendingClipUrl: string | null;
  /** Item id to open in the closet editor — set by the `://item?id=` deep link
   *  from a shared link's "Open in Wardrobe". WardrobeView consumes + clears it. */
  pendingOpenItemId: string | null;
  /** Wish piece queued by "Style it" — consumed once by the canvas builder (AJA-245). */
  pendingStyleItemId: string | null;
  /** Which look the outfit detail screen is showing (AJA-239). Transient. */
  selectedOutfitId: string | null;
  /** Bumped by the native dock on any tab tap so an open (portaled) item editor
   *  dismisses itself — otherwise it stays over the newly-selected view. */
  editorCloseNonce: number;
  /** Set when a shared-closet invite notification is tapped, so WardrobeView opens
   *  its "Shared" tab. WardrobeView consumes + clears it (survives a cold mount on
   *  web where the closet tab isn't kept alive). */
  pendingWardrobeTab: "shared" | null;
  /** Which closet tab is showing. In the store, not local state, so the native "+" knows
   *  whether it's adding to the closet or the wishlist (AJA-245 follow-up). */
  wardrobeTab: "items" | "wishlist" | "shared";
  /** A styling session to surface/open (AJA-240). Not persisted — it's navigation. */
  pendingStyleSessionId: string | null;
  /** The session whose live board is on screen. */
  styleSessionId: string | null;
  /** An image shared into the app (iOS Share Extension) as a data URL — opens the add
   *  form pre-loaded with the photo. ItemForm consumes it, then clears it. */
  pendingSharedImage: string | null;
  filters: Filters;
  /** Item ids currently placed in each builder slot. */
  draft: Record<SlotKey, string[]>;
  /** Explore pins saved to the user's board. */
  savedPinIds: string[];
  /**
   * AJA-258 — user override for the ambient context Surprise me and Today read.
   * `mode: "auto"` (the default) means "use the detected weather", i.e. unchanged
   * behaviour. Screens with their OWN context (Calendar's tapped date, Travel's
   * trip) deliberately ignore this.
   */
  styleContext: StyleContext;
  /** Freeform canvas items. */
  canvasDraft: CanvasItem[];
  /** Board background for the canvas composer (CSS color/gradient, or null). */
  canvasBg: string | null;

  addItem: (item: Omit<WardrobeItem, "id" | "createdAt">) => void;
  /**
   * Prepend items that already HAVE ids — the wishlist inbox drain (AJA-241). addItem
   * mints a fresh id, which would defeat the id-based dedupe and re-add the same save
   * on every drain.
   */
  absorbItems: (items: WardrobeItem[]) => void;
  updateItem: (id: string, patch: Partial<WardrobeItem>) => void;
  deleteItem: (id: string) => void;
  /** Remove the seeded sample/starter pieces (the "clear samples" affordance). */
  clearSamples: () => void;
  /** Swap the starter closet to the gender-matched capsule — only while it's still the
   *  untouched sample set (so it never clobbers a real closet or re-seeds a cleared one). */
  seedSampleCloset: (gender: UserProfile["shopGender"]) => void;

  saveOutfit: (
    name: string,
    notes: string,
    itemIds: string[],
    layout?: CanvasItem[],
    canvasBg?: string | null,
  ) => string;
  deleteOutfit: (id: string) => void;
  /** Star/unstar a look in the library (AJA-239). */
  toggleOutfitFavorite: (id: string) => void;
  renameOutfit: (id: string, name: string) => void;
  /**
   * Attach (or clear, with null) a saved try-on render (AJA-275). Takes a bucket
   * PATH — pass the result of `uploadPrivateRender`, never a signed URL.
   */
  setOutfitRender: (id: string, path: string | null) => void;
  /** Deep-copy a look (new ids, wear history reset). Returns the new id. */
  duplicateOutfit: (id: string) => string | null;
  /** Open the outfit detail screen for a look. */
  openOutfitDetail: (id: string) => void;
  loadOutfitIntoDraft: (id: string) => void;
  /** Restore a saved outfit's board layout into the freeform canvas + open the builder. */
  loadOutfitBoardIntoCanvas: (id: string) => void;


  /** Log that an outfit (or loose items) was worn on a date. */
  logWear: (opts: {
    outfitId?: string;
    itemIds: string[];
    date?: string;
    note?: string;
  }) => void;
  /** Schedule an outfit for a future (or today) date. */
  planOutfit: (opts: {
    outfitId?: string;
    itemIds: string[];
    date: string;
    note?: string;
  }) => void;
  deleteCalendarEntry: (id: string) => void;

  updateProfile: (patch: Partial<UserProfile>) => void;
  resetAll: () => void;
  setAuthUser: (user: AuthUser | null) => void;
  setAuthChecked: (checked: boolean) => void;
  setSyncStatus: (status: SyncStatus, error?: string | null) => void;
  setImportStatus: (status: ImportStatus | null) => void;
  setPendingImports: (list: PendingImport[]) => void;
  setImportReviewOpen: (open: boolean) => void;
  setPasswordRecovery: (active: boolean) => void;

  setTheme: (t: ThemeMode) => void;
  setView: (v: View) => void;
  openPhoto: (card: PhotoCard) => void;
  openThread: (id: string) => void;
  /** Open the AI Stylist thread (a local view, not a Supabase conversation).
   *  An optional seed message is auto-sent when the thread opens. */
  openStylist: (seed?: string) => void;
  /** Consume the one-shot Stylist seed message (StylistView calls this once). */
  clearStylistSeed: () => void;
  openUserProfile: (userId: string) => void;
  setSettingsSection: (s: SettingsSection) => void;
  setAddOpen: (open: boolean) => void;
  setWishlistAddOpen: (open: boolean) => void;
  /** Queue / clear a shared product URL for the wishlist quick-save (ClipLinkLoader). */
  setPendingClipUrl: (url: string | null) => void;
  setPendingOpenItemId: (id: string | null) => void;
  dismissItemEditor: () => void;
  jumpToSharedCloset: () => void;
  /** Land on Outfits with a styling session highlighted (from a notification). */
  jumpToStyling: (sessionId?: string | null) => void;
  setPendingStyleSessionId: (id: string | null) => void;
  /** Open the live shared board for a session. */
  openStyleSession: (sessionId: string) => void;
  setPendingWardrobeTab: (t: "shared" | null) => void;
  setWardrobeTab: (t: "items" | "wishlist" | "shared") => void;
  /** Queue / clear a shared image (data URL) for the add form (ItemForm). */
  setPendingSharedImage: (dataUrl: string | null) => void;
  /** Open the add form pre-loaded with a shared image (iOS Share Extension). */
  openAddWithImage: (dataUrl: string) => void;
  /** Open the add form pointed at a specific input (camera/upload/link). */
  openAdd: (intent?: "camera" | "upload" | "link" | null) => void;
  setBulkOpen: (open: boolean) => void;
  setAddSheetOpen: (open: boolean) => void;
  /** Open the "add whole outfit" split flow, optionally auto-triggering a source. */
  openSplit: (source?: "camera" | "library") => void;
  setSplitOpen: (open: boolean) => void;
  /** Open the multi-photo scan flow, optionally auto-triggering a source. */
  openScan: (source?: "camera" | "library") => void;
  setScanOpen: (open: boolean) => void;
  setClosetsOpen: (open: boolean) => void;
  setFilters: (patch: Partial<Filters>) => void;

  addToDraft: (itemId: string) => void;
  removeFromDraft: (slot: SlotKey, itemId: string) => void;
  clearDraft: () => void;
  setDraft: (draft: Record<SlotKey, string[]>) => void;
  setCanvasDraft: (items: CanvasItem[]) => void;
  /** Open the canvas and build a look around this piece (AJA-245). Only the id is
   *  queued: the layout needs the measured board, which only the builder knows. */
  styleAroundItem: (itemId: string) => void;
  clearPendingStyleItem: () => void;
  addCanvasItem: (itemId: string) => void;
  addCanvasText: (text: string, color: string) => void;
  addCanvasSticker: (emoji: string) => void;
  updateCanvasItem: (id: string, patch: Partial<CanvasItem>) => void;
  removeCanvasItem: (id: string) => void;
  setCanvasBg: (bg: string | null) => void;
  /** Save/unsave an Explore pin. */
  toggleSavePin: (id: string) => void;
  setStyleContext: (patch: Partial<StyleContext>) => void;
  /** Replace persisted fields from a remote snapshot (Supabase pull). */
  hydrateFromRemote: (data: {
    items: WardrobeItem[];
    outfits: Outfit[];
    calendar?: CalendarEntry[];
    profile?: UserProfile;
    theme: ThemeMode;
    draft: Record<SlotKey, string[]>;
    canvasDraft?: CanvasItem[];
  }) => void;
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Coerce a possibly-malformed stored item into a valid WardrobeItem. Legacy or
 * partially-synced data (e.g. a missing `tags` array) must never crash the UI.
 */
function normalizeItem(raw: Partial<WardrobeItem> | null | undefined): WardrobeItem {
  const it = (raw ?? {}) as Partial<WardrobeItem>;
  const category = (it.category ?? "top") as Category;
  const name = typeof it.name === "string" ? it.name : "";
  const tags = Array.isArray(it.tags)
    ? it.tags.filter((t): t is string => typeof t === "string")
    : [];
  return {
    id: typeof it.id === "string" ? it.id : uid(),
    name,
    imageUrl: typeof it.imageUrl === "string" ? it.imageUrl : "",
    // Image-attribute fields must be whitelisted here or they're stripped on every
    // localStorage rehydrate / Supabase pull (revert sources + engine/model stamps).
    originalImageUrl: typeof it.originalImageUrl === "string" ? it.originalImageUrl : undefined,
    cutoutEngine: typeof it.cutoutEngine === "string" ? it.cutoutEngine : undefined,
    beautifiedImageUrl: typeof it.beautifiedImageUrl === "string" ? it.beautifiedImageUrl : undefined,
    beautifyWhiteUrl: typeof it.beautifyWhiteUrl === "string" ? it.beautifyWhiteUrl : undefined,
    cutoutImageUrl: typeof it.cutoutImageUrl === "string" ? it.cutoutImageUrl : undefined,
    beautifyModel: typeof it.beautifyModel === "string" ? it.beautifyModel : undefined,
    fit: typeof it.fit === "string" && (FIT_VALUES as readonly string[]).includes(it.fit) ? (it.fit as Fit) : undefined,
    tone: typeof it.tone === "string" ? it.tone : undefined,
    formality: typeof it.formality === "string" ? it.formality : undefined,
    // AJA-223 attrs — must be whitelisted here too or they're stripped on reload/pull.
    material: typeof it.material === "string" ? it.material : undefined,
    pattern: typeof it.pattern === "string" ? it.pattern : undefined,
    size: typeof it.size === "string" ? it.size : undefined,
    styleCaption: typeof it.styleCaption === "string" ? it.styleCaption : undefined,
    productUrl: typeof it.productUrl === "string" ? it.productUrl : undefined,
    category,
    // Backfill a sub-category for existing items with none (AJA-228) — deterministic, from the
    // name/tags; never overrides a value already set. Must be whitelisted here or it's stripped.
    // AJA-265: `migrateSubcategory` re-files values that left the vocabulary
    // (`longsleeve`) and splits athletic footwear out of plain `sneakers`. Runs on
    // every load, which is fine because it is idempotent and only ever acts on
    // explicit evidence in the item's own name.
    subcategory:
      typeof it.subcategory === "string" && it.subcategory
        ? migrateSubcategory(category, it.subcategory, name)
        : inferSubcategory(category, name, tags),
    color: typeof it.color === "string" ? it.color : "#a8a29e",
    colorName: typeof it.colorName === "string" ? it.colorName : undefined,
    tags,
    seasons: Array.isArray(it.seasons)
      ? (it.seasons.filter((s) => typeof s === "string") as Season[])
      : [],
    brand: typeof it.brand === "string" ? it.brand : undefined,
    price: typeof it.price === "number" ? it.price : undefined,
    notes: typeof it.notes === "string" ? it.notes : undefined,
    wishlist: Boolean(it.wishlist),
    favorite: Boolean(it.favorite),
    wearCount: typeof it.wearCount === "number" ? it.wearCount : undefined,
    lastWornAt: typeof it.lastWornAt === "string" ? it.lastWornAt : undefined,
    // AJA-244 — same whitelist trap as above: without this line "I bought it" would
    // stamp a purchase date that vanished on the next reload or pull.
    purchasedAt: typeof it.purchasedAt === "string" ? it.purchasedAt : undefined,
    createdAt: typeof it.createdAt === "number" ? it.createdAt : Date.now(),
  };
}

function normalizeCanvasItem(raw: Partial<CanvasItem> | null | undefined): CanvasItem {
  const c = (raw ?? {}) as Partial<CanvasItem>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    id: typeof c.id === "string" ? c.id : uid(),
    kind: c.kind === "text" || c.kind === "sticker" ? c.kind : "item",
    itemId: typeof c.itemId === "string" ? c.itemId : undefined,
    text: typeof c.text === "string" ? c.text : undefined,
    color: typeof c.color === "string" ? c.color : undefined,
    emoji: typeof c.emoji === "string" ? c.emoji : undefined,
    x: num(c.x, 0),
    y: num(c.y, 0),
    width: num(c.width, 150),
    height: num(c.height, 150),
    rotation: num(c.rotation, 0),
    zIndex: num(c.zIndex, 0),
    flipped: Boolean(c.flipped),
  };
}

/** `wishItemIds` as stored: strings only, and absent rather than empty. */
function normalizeWishIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((x): x is string => typeof x === "string" && !!x);
  return ids.length ? ids : undefined;
}

function normalizeOutfit(raw: Partial<Outfit> | null | undefined): Outfit {
  const o = (raw ?? {}) as Partial<Outfit>;
  return {
    id: typeof o.id === "string" ? o.id : uid(),
    name: typeof o.name === "string" ? o.name : "",
    notes: typeof o.notes === "string" ? o.notes : undefined,
    itemIds: Array.isArray(o.itemIds)
      ? o.itemIds.filter((x): x is string => typeof x === "string")
      : [],
    layout: Array.isArray(o.layout) ? o.layout.map(normalizeCanvasItem) : undefined,
    canvasBg: typeof o.canvasBg === "string" ? o.canvasBg : undefined,
    // AJA-239 — whitelist or it's stripped on every reload/pull (cf. AJA-223).
    favorite: o.favorite === true ? true : undefined,
    // AJA-245 — same. Empty collapses to undefined, so a look whose pieces have all been
    // bought is indistinguishable from one that never had wish pieces.
    wishItemIds: normalizeWishIds(o.wishItemIds),
    // AJA-275 — whitelist or it's stripped on every reload/pull. Validated as a
    // PATH, not merely as a string: `isRenderPath` rejects data URLs (400k+ chars,
    // which is how the snapshot size budget gets blown) and signed URLs (which
    // expire, and which no scrubber catches because they only test `^data:`).
    tryOnRenderPath: isRenderPath(o.tryOnRenderPath) ? o.tryOnRenderPath : undefined,
    wearCount: typeof o.wearCount === "number" ? o.wearCount : undefined,
    lastWornAt: typeof o.lastWornAt === "string" ? o.lastWornAt : undefined,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
  };
}

function normalizeCalendarEntry(
  raw: Partial<CalendarEntry> | null | undefined,
): CalendarEntry {
  const e = (raw ?? {}) as Partial<CalendarEntry>;
  return {
    id: typeof e.id === "string" ? e.id : uid(),
    date: typeof e.date === "string" ? e.date : todayISO(),
    kind: e.kind === "planned" ? "planned" : "worn",
    outfitId: typeof e.outfitId === "string" ? e.outfitId : undefined,
    itemIds: Array.isArray(e.itemIds)
      ? e.itemIds.filter((x): x is string => typeof x === "string")
      : [],
    note: typeof e.note === "string" ? e.note : undefined,
    createdAt: typeof e.createdAt === "number" ? e.createdAt : Date.now(),
  };
}

/** Ensure the draft has every slot present as a string array. */
function normalizeDraft(d: unknown): Record<SlotKey, string[]> {
  const base = emptyDraft();
  if (d && typeof d === "object") {
    for (const key of Object.keys(base) as SlotKey[]) {
      const arr = (d as Record<string, unknown>)[key];
      if (Array.isArray(arr)) {
        base[key] = arr.filter((x): x is string => typeof x === "string");
      }
    }
  }
  return base;
}

export const useWardrobe = create<WardrobeState>()(
  persist(
    (set, get) => ({
      // Default (unset shopGender) → women's sample capsule + its pre-saved outfits.
      // Signed-in seeding paths re-seed gender-matched via sampleCloset(profile.shopGender).
      items: sampleCloset().items,
      outfits: sampleCloset().outfits,
      calendar: [],
      profile: { ...DEFAULT_PROFILE },
      authUser: null,
      authChecked: false,
      syncStatus: "offline" as SyncStatus,
      syncError: null as string | null,
      passwordRecovery: false,
      theme: "light",
      view: "explore",
      photoCard: null,
      activeThreadId: null,
      stylistSeed: null,
      viewUserId: null,
      settingsSection: "profile",
      addOpen: false,
      wishlistAddOpen: false,
      addIntent: null,
      bulkOpen: false,
      addSheetOpen: false,
      splitOpen: false,
      splitSource: null,
      scanOpen: false,
      scanSource: null,
      closetsOpen: false,
      pendingClipUrl: null,
      pendingOpenItemId: null,
      pendingStyleItemId: null,
      selectedOutfitId: null,
      editorCloseNonce: 0,
      pendingWardrobeTab: null,
      wardrobeTab: "items" as "items" | "wishlist" | "shared",
      pendingStyleSessionId: null,
      styleSessionId: null,
      pendingSharedImage: null,
      importStatus: null,
      pendingImports: [],
      importReviewOpen: false,
      filters: { search: "", category: "all", season: "all", tag: "all" },
      draft: emptyDraft(),
      savedPinIds: [],
      styleContext: { ...DEFAULT_STYLE_CONTEXT },
      canvasDraft: [],
      canvasBg: null,

      addItem: (item) =>
        set((s) => ({
          items: [{ ...item, id: uid(), createdAt: Date.now() }, ...s.items],
        })),

      absorbItems: (incoming) =>
        set((s) => {
          const have = new Set(s.items.map((it) => it.id));
          const fresh = incoming.filter((it) => it?.id && !have.has(it.id));
          return fresh.length ? { items: [...fresh, ...s.items] } : {};
        }),

      updateItem: (id, patch) =>
        set((s) => {
          const items = s.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
          // A piece becoming owned ("I bought it", or the wishlist toggle in the editor)
          // heals every look that was waiting on it — once the last one clears, the look
          // stops being badged and rejoins the ordinary wear stats (AJA-245).
          if (patch.wishlist === false) {
            return {
              items,
              outfits: s.outfits.map((o) =>
                o.wishItemIds?.includes(id)
                  ? { ...o, wishItemIds: normalizeWishIds(o.wishItemIds.filter((w) => w !== id)) }
                  : o,
              ),
            };
          }
          return { items };
        }),

      deleteItem: (id) =>
        set((s) => ({
          items: s.items.filter((it) => it.id !== id),
          outfits: s.outfits.map((o) => ({
            ...o,
            itemIds: o.itemIds.filter((iid) => iid !== id),
            wishItemIds: normalizeWishIds(o.wishItemIds?.filter((iid) => iid !== id)),
          })),
          calendar: s.calendar.map((e) => ({
            ...e,
            itemIds: e.itemIds.filter((iid) => iid !== id),
          })),
          draft: Object.fromEntries(
            Object.entries(s.draft).map(([k, ids]) => [
              k,
              ids.filter((iid) => iid !== id),
            ]),
          ) as Record<SlotKey, string[]>,
        })),

      clearSamples: () =>
        set((s) => {
          const gone = (iid: string) => isSampleItem({ id: iid });
          return {
            items: s.items.filter((it) => !isSampleItem(it)),
            // Drop the pre-saved sample outfits entirely; strip sample ids from any real ones.
            outfits: s.outfits
              .filter((o) => !o.id.startsWith("demo-"))
              .map((o) => ({ ...o, itemIds: o.itemIds.filter((iid) => !gone(iid)) })),
            calendar: s.calendar.map((e) => ({
              ...e,
              itemIds: e.itemIds.filter((iid) => !gone(iid)),
            })),
            draft: Object.fromEntries(
              Object.entries(s.draft).map(([k, ids]) => [
                k,
                ids.filter((iid) => !gone(iid)),
              ]),
            ) as Record<SlotKey, string[]>,
          };
        }),

      seedSampleCloset: (gender) =>
        set((s) => {
          // Guard: only while the closet is still the untouched sample set (all items are
          // samples AND at least one exists) — never clobber a real closet or re-seed after
          // the user cleared samples. Outfits are all `demo-` in that state, so replace both.
          if (s.items.length === 0 || !s.items.every(isSampleItem)) return s;
          const sample = sampleCloset(gender);
          return { items: sample.items, outfits: sample.outfits };
        }),

      saveOutfit: (name, notes, itemIds, layout, canvasBg) => {
        recordOutfitCreated();
        // Hoisted out of the updater so the caller can correlate the save back to
        // whatever produced the look (AJA-255). Returning the id also matches
        // duplicateOutfit, which already does this.
        const id = uid();
        set((s) => ({
          outfits: [
            {
              id,
              name,
              notes,
              itemIds,
              layout: layout && layout.length ? layout : undefined,
              canvasBg: canvasBg ?? undefined,
              // Derived here rather than passed in (AJA-245), so no caller can save a
              // look with unowned pieces and forget to mark it.
              wishItemIds: normalizeWishIds(
                itemIds.filter((id) => s.items.find((it) => it.id === id)?.wishlist),
              ),
              createdAt: Date.now(),
            },
            ...s.outfits,
          ],
        }));
        return id;
      },

      deleteOutfit: (id) =>
        set((s) => ({
          outfits: s.outfits.filter((o) => o.id !== id),
          calendar: s.calendar.map((e) =>
            e.outfitId === id ? { ...e, outfitId: undefined } : e,
          ),
        })),

      toggleOutfitFavorite: (id) =>
        set((s) => ({
          outfits: s.outfits.map((o) =>
            o.id === id ? { ...o, favorite: !o.favorite } : o,
          ),
        })),

      renameOutfit: (id, name) =>
        set((s) => ({
          outfits: s.outfits.map((o) => (o.id === id ? { ...o, name } : o)),
        })),

      setOutfitRender: (id, path) =>
        set((s) => ({
          outfits: s.outfits.map((o) => {
            if (o.id !== id) return o;
            // Validate on the way IN as well as in normalizeOutfit. Without this a
            // caller could park a data URL or a signed URL in memory, where it
            // would reach `partialize` and count against the snapshot budget before
            // any normalizer saw it.
            const next = path !== null && isRenderPath(path) ? path : undefined;
            return { ...o, tryOnRenderPath: next };
          }),
        })),

      duplicateOutfit: (id) => {
        const src = get().outfits.find((o) => o.id === id);
        if (!src) return null;
        const copy: Outfit = {
          ...src,
          id: uid(),
          name: `${src.name} copy`,
          // Deep-copy the board so editing the duplicate can't mutate the original.
          layout: src.layout?.map((c) => ({ ...c, id: uid() })),
          favorite: undefined,
          wearCount: undefined,
          lastWornAt: undefined,
          createdAt: Date.now(),
        };
        set((s) => ({ outfits: [copy, ...s.outfits] }));
        return copy.id;
      },

      openOutfitDetail: (id) => set({ selectedOutfitId: id, view: "outfitDetail" }),

      logWear: ({ outfitId, itemIds, date, note }) => {
        const day = date ?? todayISO();
        recordWearLogged();
        // AJA-255 — the strongest positive label the engine can get. Hooked here
        // rather than at the call sites because there are several and a wear logged
        // from Calendar counts exactly as much as one logged from a look's detail.
        lookWorn({ outfitId, itemIds });
        set((s) => {
          const ids = [...new Set(itemIds)];
          // A piece you don't own can't have been worn. Without this, styling a wish
          // piece and logging the look would inflate its wearCount, and that number
          // feeds projectedAnnualWears and the closet's cost-per-wear average — the
          // two things the "Should I?" sheet quotes back at you (AJA-245).
          const wornIds = ids.filter((id) => !s.items.find((it) => it.id === id)?.wishlist);
          const entry: CalendarEntry = {
            id: uid(),
            date: day,
            kind: "worn",
            outfitId,
            itemIds: ids,
            note,
            createdAt: Date.now(),
          };
          return {
            calendar: [entry, ...s.calendar],
            items: s.items.map((it) =>
              wornIds.includes(it.id)
                ? {
                    ...it,
                    wearCount: (it.wearCount ?? 0) + 1,
                    lastWornAt: day,
                  }
                : it,
            ),
            outfits: outfitId
              ? s.outfits.map((o) =>
                  o.id === outfitId
                    ? {
                        ...o,
                        wearCount: (o.wearCount ?? 0) + 1,
                        lastWornAt: day,
                      }
                    : o,
                )
              : s.outfits,
          };
        });
      },

      planOutfit: ({ outfitId, itemIds, date, note }) =>
        set((s) => ({
          calendar: [
            {
              id: uid(),
              date,
              kind: "planned",
              outfitId,
              itemIds: [...new Set(itemIds)],
              note,
              createdAt: Date.now(),
            },
            ...s.calendar,
          ],
        })),

      deleteCalendarEntry: (id) =>
        set((s) => ({
          calendar: s.calendar.filter((e) => e.id !== id),
        })),

      loadOutfitIntoDraft: (id) => {
        const { outfits, items } = get();
        const outfit = outfits.find((o) => o.id === id);
        if (!outfit) return;
        const draft = emptyDraft();
        for (const itemId of outfit.itemIds) {
          const item = items.find((it) => it.id === itemId);
          if (!item) continue;
          const slot = slotForCategory(item.category);
          const max = SLOT_CONFIG.find((s) => s.key === slot)?.max ?? 1;
          if (draft[slot].length < max) draft[slot].push(itemId);
        }
        set({ draft, view: "builder" });
      },

      loadOutfitBoardIntoCanvas: (id) => {
        const { outfits } = get();
        const outfit = outfits.find((o) => o.id === id);
        if (!outfit) return;
        // Fresh objects (clone) so editing the canvas never mutates the saved layout.
        const canvasDraft: CanvasItem[] =
          outfit.layout && outfit.layout.length
            ? outfit.layout.map(normalizeCanvasItem)
            : // Legacy outfit with no saved board: auto-place its items in a stack.
              outfit.itemIds.map((itemId, i) => ({
                id: uid(),
                kind: "item" as const,
                itemId,
                x: 90,
                y: 40 + i * 130,
                width: 150,
                height: 150,
                rotation: 0,
                zIndex: i,
                flipped: false,
              }));
        set({ canvasDraft, canvasBg: outfit.canvasBg ?? null, view: "builder" });
      },

      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),

      resetAll: () =>
        set({
          items: [],
          outfits: [],
          calendar: [],
          profile: { ...DEFAULT_PROFILE },
          draft: emptyDraft(),
          canvasDraft: [],
          canvasBg: null,
          theme: "light",
        }),

      setAuthUser: (authUser) => set({ authUser }),
      setAuthChecked: (authChecked) => set({ authChecked }),
      setSyncStatus: (syncStatus, error) =>
        set({
          syncStatus,
          syncError:
            syncStatus === "error"
              ? (error ?? "Sync failed")
              : null,
        }),
      setImportStatus: (importStatus) => set({ importStatus }),
      setPendingImports: (pendingImports) => set({ pendingImports }),
      setImportReviewOpen: (importReviewOpen) => set({ importReviewOpen }),
      setPasswordRecovery: (passwordRecovery) => set({ passwordRecovery }),

      setTheme: (theme) => set({ theme }),
      setView: (view) => set({ view }),
      openPhoto: (card) => set({ photoCard: card, view: "photoDetail" }),
      openThread: (id) => set({ activeThreadId: id, view: "chat" }),
      openStylist: (seed) => set({ view: "stylist", stylistSeed: seed ?? null }),
      clearStylistSeed: () => set({ stylistSeed: null }),
      openUserProfile: (userId) => set({ viewUserId: userId, view: "userProfile" }),
      setSettingsSection: (settingsSection) => set({ settingsSection }),
      setAddOpen: (addOpen) => set({ addOpen, ...(addOpen ? {} : { addIntent: null }) }),
      setWishlistAddOpen: (wishlistAddOpen) => set({ wishlistAddOpen }),
      openAdd: (intent = null) => set({ addOpen: true, addIntent: intent }),
      setBulkOpen: (bulkOpen) => set({ bulkOpen }),
      setAddSheetOpen: (addSheetOpen) => set({ addSheetOpen }),
      openSplit: (source) => set({ splitOpen: true, splitSource: source ?? null }),
      setSplitOpen: (splitOpen) =>
        set({ splitOpen, ...(splitOpen ? {} : { splitSource: null }) }),
      openScan: (source) => set({ scanOpen: true, scanSource: source ?? null }),
      setScanOpen: (scanOpen) =>
        set({ scanOpen, ...(scanOpen ? {} : { scanSource: null }) }),
      setClosetsOpen: (closetsOpen) => set({ closetsOpen }),
      setPendingClipUrl: (pendingClipUrl) => set({ pendingClipUrl }),
      setPendingOpenItemId: (pendingOpenItemId) => set({ pendingOpenItemId }),
      dismissItemEditor: () =>
        set((s) => ({ editorCloseNonce: s.editorCloseNonce + 1 })),
      jumpToSharedCloset: () =>
        set({ pendingWardrobeTab: "shared", view: "wardrobe" }),
      jumpToStyling: (sessionId) =>
        set({ pendingStyleSessionId: sessionId ?? null, view: "outfits" }),
      setPendingStyleSessionId: (pendingStyleSessionId) => set({ pendingStyleSessionId }),
      openStyleSession: (styleSessionId) => set({ styleSessionId, view: "styleSession" }),
      setPendingWardrobeTab: (pendingWardrobeTab) => set({ pendingWardrobeTab }),
      setWardrobeTab: (wardrobeTab) => set({ wardrobeTab }),
      setPendingSharedImage: (pendingSharedImage) => set({ pendingSharedImage }),
      openAddWithImage: (dataUrl) =>
        set({ addOpen: true, addIntent: null, pendingSharedImage: dataUrl }),
      setFilters: (patch) =>
        set((s) => ({ filters: { ...s.filters, ...patch } })),

      addToDraft: (itemId) => {
        const { items, draft } = get();
        const item = items.find((it) => it.id === itemId);
        if (!item) return;
        const slot = slotForCategory(item.category);
        const max = SLOT_CONFIG.find((s) => s.key === slot)?.max ?? 1;
        const next = { ...draft, [slot]: [...draft[slot]] };
        if (next[slot].includes(itemId)) return;
        if (next[slot].length >= max) {
          next[slot].shift();
        }
        next[slot].push(itemId);
        if (slot === "dress") {
          next.top = [];
          next.bottom = [];
        } else if (slot === "top" || slot === "bottom") {
          next.dress = [];
        }
        set({ draft: next });
      },

      removeFromDraft: (slot, itemId) =>
        set((s) => ({
          draft: {
            ...s.draft,
            [slot]: s.draft[slot].filter((id) => id !== itemId),
          },
        })),

      clearDraft: () =>
        set({ draft: emptyDraft(), canvasDraft: [], canvasBg: null }),
      setDraft: (draft) => set({ draft }),
      setCanvasDraft: (items) => set({ canvasDraft: items }),
      styleAroundItem: (itemId) =>
        set({ pendingStyleItemId: itemId, canvasDraft: [], view: "builder" }),
      clearPendingStyleItem: () => set({ pendingStyleItemId: null }),
      addCanvasItem: (itemId) => set((s) => ({
        canvasDraft: [
          ...s.canvasDraft,
          {
            id: uid(),
            kind: "item",
            itemId,
            x: 100 + s.canvasDraft.length * 20,
            y: 100 + s.canvasDraft.length * 20,
            width: 150,
            height: 150,
            rotation: 0,
            zIndex: s.canvasDraft.length,
            flipped: false,
          },
        ],
      })),
      addCanvasText: (text, color) => set((s) => ({
        canvasDraft: [
          ...s.canvasDraft,
          {
            id: uid(),
            kind: "text",
            text,
            color,
            x: 90,
            y: 110,
            width: 200,
            height: 64,
            rotation: 0,
            zIndex: s.canvasDraft.length,
            flipped: false,
          },
        ],
      })),
      addCanvasSticker: (emoji) => set((s) => ({
        canvasDraft: [
          ...s.canvasDraft,
          {
            id: uid(),
            kind: "sticker",
            emoji,
            x: 120 + s.canvasDraft.length * 16,
            y: 120 + s.canvasDraft.length * 16,
            width: 96,
            height: 96,
            rotation: 0,
            zIndex: s.canvasDraft.length,
            flipped: false,
          },
        ],
      })),
      updateCanvasItem: (id, patch) => set((s) => ({
        canvasDraft: s.canvasDraft.map(it => it.id === id ? { ...it, ...patch } : it)
      })),
      removeCanvasItem: (id) => set((s) => ({
        canvasDraft: s.canvasDraft.filter(it => it.id !== id)
      })),
      setCanvasBg: (bg) => set({ canvasBg: bg }),
      toggleSavePin: (id) =>
        set((s) => ({
          savedPinIds: s.savedPinIds.includes(id)
            ? s.savedPinIds.filter((x) => x !== id)
            : [id, ...s.savedPinIds],
        })),


      // Patch, not replace, so the UI can flip one field without restating the
      // rest — and re-normalized on the way in, so no caller can push a bad value.
      setStyleContext: (patch) =>
        set((st) => ({ styleContext: normalizeStyleContext({ ...st.styleContext, ...patch }, st.styleContext) })),

      hydrateFromRemote: (data) =>
        set(() => {
          const profile = data.profile ?? get().profile;
          const scrubbed = scrubSnapshotImages({
            items: Array.isArray(data.items)
              ? data.items.map(normalizeItem)
              : [],
            outfits: Array.isArray(data.outfits)
              ? data.outfits.map(normalizeOutfit)
              : [],
            calendar: Array.isArray(data.calendar)
              ? data.calendar.map(normalizeCalendarEntry)
              : get().calendar,
            profile,
            theme: (data.theme === "dark" ? "dark" : "light") as ThemeMode,
            draft: normalizeDraft(data.draft),
            canvasDraft: Array.isArray(data.canvasDraft) ? data.canvasDraft : get().canvasDraft,
          });
          return {
            ...scrubbed,
            // Cold start / sync: open to the user's preferred start screen.
            view: resolveStartView(profile),
          };
        }),
    }),
    {
      // v2: scrub HEIC/oversized data-URLs so poisoned v1 localStorage can't re-break sync.
      name: "wardrobe-store-v2",
      merge: (persisted, current) => {
        const p = scrubSnapshotImages(
          (persisted ?? {}) as Partial<WardrobeState>,
        );
        return {
          ...current,
          ...p,
          items: Array.isArray(p.items)
            ? p.items.map(normalizeItem)
            : current.items,
          outfits: Array.isArray(p.outfits)
            ? p.outfits.map(normalizeOutfit)
            : current.outfits,
          calendar: Array.isArray(p.calendar)
            ? p.calendar.map(normalizeCalendarEntry)
            : current.calendar,
          draft: normalizeDraft(p.draft),
          canvasDraft: Array.isArray(p.canvasDraft) ? p.canvasDraft : current.canvasDraft,
          profile: { ...DEFAULT_PROFILE, ...(p.profile ?? {}) },
          // `...p` above spreads persisted fields straight through, so this is the
          // only chance to reject a corrupt blob before it reaches the engine as
          // season:"banana" or tempC:NaN (AJA-258).
          styleContext: normalizeStyleContext(p.styleContext),
          theme: p.theme === "dark" ? "dark" : "light",
          // Launch screen comes from profile.startView (not last-visited tab).
          view: resolveStartView(p.profile),
        };
      },
      partialize: (s) =>
        scrubSnapshotImages({
          items: s.items,
          outfits: s.outfits,
          calendar: s.calendar,
          profile: s.profile,
          theme: s.theme,
          draft: s.draft,
          canvasDraft: s.canvasDraft,
          canvasBg: s.canvasBg,
          savedPinIds: s.savedPinIds,
          styleContext: s.styleContext,
        }),
    },
  ),
);

/** All item ids currently in the builder draft, in visual layer order. */
export function draftItemIds(draft: Record<SlotKey, string[]>): string[] {
  return SLOT_CONFIG.flatMap((slot) => draft[slot.key]);
}
