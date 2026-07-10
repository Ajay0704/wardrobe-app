"use client";

/**
 * Global app state, persisted to localStorage via zustand's persist
 * middleware. To move to Supabase/Firebase later, replace the storage
 * adapter (or sync in a subscribe callback) — component code is unaffected.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Category, Outfit, Season, SlotKey, Trip, WardrobeItem } from "./types";
import { SLOT_CONFIG, slotForCategory } from "./types";
import { demoItems } from "./demo-data";
import {
  DEFAULT_PROFILE,
  type AuthUser,
  type SettingsSection,
  type UserProfile,
} from "./profile";
import type { SyncStatus } from "./supabase/sync";

export type ThemeMode = "light" | "dark";
export type View =
  | "wardrobe"
  | "builder"
  | "outfits"
  | "wishlist"
  | "travel"
  | "settings";

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
  profile: UserProfile;
  authUser: AuthUser | null;
  /** False until the initial Supabase session check resolves (gates the UI). */
  authChecked: boolean;
  syncStatus: SyncStatus;
  /** True while a password-recovery link is active (set-new-password flow). */
  passwordRecovery: boolean;
  theme: ThemeMode;
  view: View;
  /** Which section the Settings view opens to. */
  settingsSection: SettingsSection;
  filters: Filters;
  /** Item ids currently placed in each builder slot. */
  draft: Record<SlotKey, string[]>;

  addItem: (item: Omit<WardrobeItem, "id" | "createdAt">) => void;
  updateItem: (id: string, patch: Partial<WardrobeItem>) => void;
  deleteItem: (id: string) => void;

  saveOutfit: (name: string, notes: string, itemIds: string[]) => void;
  deleteOutfit: (id: string) => void;
  loadOutfitIntoDraft: (id: string) => void;

  addTrip: (trip: Omit<Trip, "id" | "createdAt">) => string;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;

  updateProfile: (patch: Partial<UserProfile>) => void;
  resetAll: () => void;
  setAuthUser: (user: AuthUser | null) => void;
  setAuthChecked: (checked: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setPasswordRecovery: (active: boolean) => void;

  setTheme: (t: ThemeMode) => void;
  setView: (v: View) => void;
  setSettingsSection: (s: SettingsSection) => void;
  setFilters: (patch: Partial<Filters>) => void;

  addToDraft: (itemId: string) => void;
  removeFromDraft: (slot: SlotKey, itemId: string) => void;
  clearDraft: () => void;
  setDraft: (draft: Record<SlotKey, string[]>) => void;
  /** Replace persisted fields from a remote snapshot (Supabase pull). */
  hydrateFromRemote: (data: {
    items: WardrobeItem[];
    outfits: Outfit[];
    trips?: Trip[];
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
      profile: { ...DEFAULT_PROFILE },
      authUser: null,
      authChecked: false,
      syncStatus: "offline" as SyncStatus,
      passwordRecovery: false,
      theme: "light",
      view: "wardrobe",
      settingsSection: "profile",
      filters: { search: "", category: "all", season: "all", tag: "all" },
      draft: emptyDraft(),

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
          // Keep saved outfits consistent when an item disappears.
          outfits: s.outfits.map((o) => ({
            ...o,
            itemIds: o.itemIds.filter((iid) => iid !== id),
          })),
          trips: s.trips.map((t) => ({
            ...t,
            itemIds: t.itemIds.filter((iid) => iid !== id),
          })),
          draft: Object.fromEntries(
            Object.entries(s.draft).map(([k, ids]) => [
              k,
              ids.filter((iid) => iid !== id),
            ]),
          ) as Record<SlotKey, string[]>,
        })),

      saveOutfit: (name, notes, itemIds) =>
        set((s) => ({
          outfits: [
            { id: uid(), name, notes, itemIds, createdAt: Date.now() },
            ...s.outfits,
          ],
        })),

      deleteOutfit: (id) =>
        set((s) => ({ outfits: s.outfits.filter((o) => o.id !== id) })),

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
          profile: { ...DEFAULT_PROFILE },
          draft: emptyDraft(),
          theme: "light",
        }),

      setAuthUser: (authUser) => set({ authUser }),
      setAuthChecked: (authChecked) => set({ authChecked }),
      setSyncStatus: (syncStatus) => set({ syncStatus }),
      setPasswordRecovery: (passwordRecovery) => set({ passwordRecovery }),

      setTheme: (theme) => set({ theme }),
      setView: (view) => set({ view }),
      setSettingsSection: (settingsSection) => set({ settingsSection }),
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
          // Single slots replace; multi slots drop the oldest.
          next[slot].shift();
        }
        next[slot].push(itemId);
        // A dress replaces top + bottom, and vice versa.
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

      hydrateFromRemote: (data) =>
        set({
          items: Array.isArray(data.items) ? data.items.map(normalizeItem) : [],
          outfits: Array.isArray(data.outfits)
            ? data.outfits.map(normalizeOutfit)
            : [],
          // Keep local trips if remote omitted them (pre-migration snapshot).
          trips: Array.isArray(data.trips)
            ? data.trips.map(normalizeTrip)
            : get().trips,
          profile: data.profile ?? get().profile,
          theme: data.theme === "dark" ? "dark" : "light",
          draft: normalizeDraft(data.draft),
        }),
    }),
    {
      name: "wardrobe-store-v1",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WardrobeState>;
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
          draft: normalizeDraft(p.draft),
          profile: { ...DEFAULT_PROFILE, ...(p.profile ?? {}) },
          theme: p.theme === "dark" ? "dark" : "light",
        };
      },
      // Persist data + preferences, not transient UI state like filters.
      partialize: (s) => ({
        items: s.items,
        outfits: s.outfits,
        trips: s.trips,
        profile: s.profile,
        theme: s.theme,
        draft: s.draft,
      }),
    },
  ),
);

/** All item ids currently in the builder draft, in visual layer order. */
export function draftItemIds(draft: Record<SlotKey, string[]>): string[] {
  return SLOT_CONFIG.flatMap((slot) => draft[slot.key]);
}
