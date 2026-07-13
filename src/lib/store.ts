"use client";

/**
 * Global app state, persisted to localStorage via zustand's persist
 * middleware. To move to Supabase/Firebase later, replace the storage
 * adapter (or sync in a subscribe callback) — component code is unaffected.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CalendarEntry,
  Category,
  Outfit,
  Season,
  SlotKey,
  Trip,
  WardrobeItem,
} from "./types";
import { SLOT_CONFIG, slotForCategory, todayISO } from "./types";
import { demoItems } from "./demo-data";
import {
  DEFAULT_PROFILE,
  resolveStartView,
  type AuthUser,
  type SettingsSection,
  type UserProfile,
} from "./profile";
import type { SyncStatus } from "./supabase/sync";
import { scrubSnapshotImages } from "./heal";
import { recordOutfitCreated, recordWearLogged } from "./habit";

export type ThemeMode = "light" | "dark";
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
  | "social"
  | "settings"
  | "notifications";

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
  trips: Trip[];
  calendar: CalendarEntry[];
  profile: UserProfile;
  authUser: AuthUser | null;
  /** False until the initial Supabase session check resolves (gates the UI). */
  authChecked: boolean;
  syncStatus: SyncStatus;
  /** Last sync failure message — shown on the SyncBadge when status is error. */
  syncError: string | null;
  /** True while a password-recovery link is active (set-new-password flow). */
  passwordRecovery: boolean;
  theme: ThemeMode;
  view: View;
  /** Which section the Settings view opens to. */
  settingsSection: SettingsSection;
  /** Global "add item" modal (opened from the center Create button). */
  addOpen: boolean;
  /** Global "import from photos" (bulk) modal, opened from Create / Closet. */
  bulkOpen: boolean;
  /** Global "closets selector" sheet (opened from the Closet header dropdown). */
  closetsOpen: boolean;
  filters: Filters;
  /** Item ids currently placed in each builder slot. */
  draft: Record<SlotKey, string[]>;
  /** Explore pins saved to the user's board. */
  savedPinIds: string[];

  addItem: (item: Omit<WardrobeItem, "id" | "createdAt">) => void;
  updateItem: (id: string, patch: Partial<WardrobeItem>) => void;
  deleteItem: (id: string) => void;

  saveOutfit: (name: string, notes: string, itemIds: string[]) => void;
  deleteOutfit: (id: string) => void;
  loadOutfitIntoDraft: (id: string) => void;

  addTrip: (trip: Omit<Trip, "id" | "createdAt">) => string;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;

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
  setPasswordRecovery: (active: boolean) => void;

  setTheme: (t: ThemeMode) => void;
  setView: (v: View) => void;
  setSettingsSection: (s: SettingsSection) => void;
  setAddOpen: (open: boolean) => void;
  setBulkOpen: (open: boolean) => void;
  setClosetsOpen: (open: boolean) => void;
  setFilters: (patch: Partial<Filters>) => void;

  addToDraft: (itemId: string) => void;
  removeFromDraft: (slot: SlotKey, itemId: string) => void;
  clearDraft: () => void;
  setDraft: (draft: Record<SlotKey, string[]>) => void;
  /** Save/unsave an Explore pin. */
  toggleSavePin: (id: string) => void;
  /** Replace persisted fields from a remote snapshot (Supabase pull). */
  hydrateFromRemote: (data: {
    items: WardrobeItem[];
    outfits: Outfit[];
    trips?: Trip[];
    calendar?: CalendarEntry[];
    profile?: UserProfile;
    theme: ThemeMode;
    draft: Record<SlotKey, string[]>;
  }) => void;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Coerce a possibly-malformed stored item into a valid WardrobeItem. Legacy or
 * partially-synced data (e.g. a missing `tags` array) must never crash the UI.
 */
function normalizeItem(raw: Partial<WardrobeItem> | null | undefined): WardrobeItem {
  const it = (raw ?? {}) as Partial<WardrobeItem>;
  return {
    id: typeof it.id === "string" ? it.id : uid(),
    name: typeof it.name === "string" ? it.name : "",
    imageUrl: typeof it.imageUrl === "string" ? it.imageUrl : "",
    productUrl: typeof it.productUrl === "string" ? it.productUrl : undefined,
    category: (it.category ?? "top") as Category,
    color: typeof it.color === "string" ? it.color : "#a8a29e",
    colorName: typeof it.colorName === "string" ? it.colorName : undefined,
    tags: Array.isArray(it.tags)
      ? it.tags.filter((t): t is string => typeof t === "string")
      : [],
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
    createdAt: typeof it.createdAt === "number" ? it.createdAt : Date.now(),
  };
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
    wearCount: typeof o.wearCount === "number" ? o.wearCount : undefined,
    lastWornAt: typeof o.lastWornAt === "string" ? o.lastWornAt : undefined,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
  };
}

function normalizeTrip(raw: Partial<Trip> | null | undefined): Trip {
  const t = (raw ?? {}) as Partial<Trip>;
  return {
    id: typeof t.id === "string" ? t.id : uid(),
    name: typeof t.name === "string" ? t.name : "",
    destination: typeof t.destination === "string" ? t.destination : undefined,
    startDate: typeof t.startDate === "string" ? t.startDate : undefined,
    endDate: typeof t.endDate === "string" ? t.endDate : undefined,
    itemIds: Array.isArray(t.itemIds)
      ? t.itemIds.filter((x): x is string => typeof x === "string")
      : [],
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
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
      items: demoItems,
      outfits: [],
      trips: [],
      calendar: [],
      profile: { ...DEFAULT_PROFILE },
      authUser: null,
      authChecked: false,
      syncStatus: "offline" as SyncStatus,
      syncError: null as string | null,
      passwordRecovery: false,
      theme: "light",
      view: "explore",
      settingsSection: "profile",
      addOpen: false,
      bulkOpen: false,
      closetsOpen: false,
      filters: { search: "", category: "all", season: "all", tag: "all" },
      draft: emptyDraft(),
      savedPinIds: [],

      addItem: (item) =>
        set((s) => ({
          items: [{ ...item, id: uid(), createdAt: Date.now() }, ...s.items],
        })),

      updateItem: (id, patch) =>
        set((s) => ({
          items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
        })),

      deleteItem: (id) =>
        set((s) => ({
          items: s.items.filter((it) => it.id !== id),
          outfits: s.outfits.map((o) => ({
            ...o,
            itemIds: o.itemIds.filter((iid) => iid !== id),
          })),
          trips: s.trips.map((t) => ({
            ...t,
            itemIds: t.itemIds.filter((iid) => iid !== id),
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

      saveOutfit: (name, notes, itemIds) => {
        recordOutfitCreated();
        set((s) => ({
          outfits: [
            { id: uid(), name, notes, itemIds, createdAt: Date.now() },
            ...s.outfits,
          ],
        }));
      },

      deleteOutfit: (id) =>
        set((s) => ({
          outfits: s.outfits.filter((o) => o.id !== id),
          calendar: s.calendar.map((e) =>
            e.outfitId === id ? { ...e, outfitId: undefined } : e,
          ),
        })),

      addTrip: (trip) => {
        const id = uid();
        set((s) => ({
          trips: [{ ...trip, id, createdAt: Date.now() }, ...s.trips],
        }));
        return id;
      },

      updateTrip: (id, patch) =>
        set((s) => ({
          trips: s.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      deleteTrip: (id) =>
        set((s) => ({ trips: s.trips.filter((t) => t.id !== id) })),

      logWear: ({ outfitId, itemIds, date, note }) => {
        const day = date ?? todayISO();
        recordWearLogged();
        set((s) => {
          const ids = [...new Set(itemIds)];
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
              ids.includes(it.id)
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

      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),

      resetAll: () =>
        set({
          items: [],
          outfits: [],
          trips: [],
          calendar: [],
          profile: { ...DEFAULT_PROFILE },
          draft: emptyDraft(),
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
      setPasswordRecovery: (passwordRecovery) => set({ passwordRecovery }),

      setTheme: (theme) => set({ theme }),
      setView: (view) => set({ view }),
      setSettingsSection: (settingsSection) => set({ settingsSection }),
      setAddOpen: (addOpen) => set({ addOpen }),
      setBulkOpen: (bulkOpen) => set({ bulkOpen }),
      setClosetsOpen: (closetsOpen) => set({ closetsOpen }),
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

      clearDraft: () => set({ draft: emptyDraft() }),
      setDraft: (draft) => set({ draft }),
      toggleSavePin: (id) =>
        set((s) => ({
          savedPinIds: s.savedPinIds.includes(id)
            ? s.savedPinIds.filter((x) => x !== id)
            : [id, ...s.savedPinIds],
        })),

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
            trips: Array.isArray(data.trips)
              ? data.trips.map(normalizeTrip)
              : get().trips,
            calendar: Array.isArray(data.calendar)
              ? data.calendar.map(normalizeCalendarEntry)
              : get().calendar,
            profile,
            theme: (data.theme === "dark" ? "dark" : "light") as ThemeMode,
            draft: normalizeDraft(data.draft),
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
          trips: Array.isArray(p.trips)
            ? p.trips.map(normalizeTrip)
            : current.trips,
          calendar: Array.isArray(p.calendar)
            ? p.calendar.map(normalizeCalendarEntry)
            : current.calendar,
          draft: normalizeDraft(p.draft),
          profile: { ...DEFAULT_PROFILE, ...(p.profile ?? {}) },
          theme: p.theme === "dark" ? "dark" : "light",
          // Launch screen comes from profile.startView (not last-visited tab).
          view: resolveStartView(p.profile),
        };
      },
      partialize: (s) =>
        scrubSnapshotImages({
          items: s.items,
          outfits: s.outfits,
          trips: s.trips,
          calendar: s.calendar,
          profile: s.profile,
          theme: s.theme,
          draft: s.draft,
          savedPinIds: s.savedPinIds,
        }),
    },
  ),
);

/** All item ids currently in the builder draft, in visual layer order. */
export function draftItemIds(draft: Record<SlotKey, string[]>): string[] {
  return SLOT_CONFIG.flatMap((slot) => draft[slot.key]);
}
