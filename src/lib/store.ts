"use client";

/**
 * Global app state, persisted to localStorage via zustand's persist
 * middleware. To move to Supabase/Firebase later, replace the storage
 * adapter (or sync in a subscribe callback) — component code is unaffected.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Category, Outfit, Season, SlotKey, WardrobeItem } from "./types";
import { SLOT_CONFIG, slotForCategory } from "./types";
import { demoItems } from "./demo-data";
import { DEFAULT_PROFILE, type AuthUser, type UserProfile } from "./profile";
import type { SyncStatus } from "./supabase/sync";

export type ThemeMode = "light" | "dark";
export type View = "wardrobe" | "builder" | "outfits" | "wishlist" | "settings";

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
  profile: UserProfile;
  authUser: AuthUser | null;
  /** False until the initial Supabase session check resolves (gates the UI). */
  authChecked: boolean;
  syncStatus: SyncStatus;
  /** True while a password-recovery link is active (set-new-password flow). */
  passwordRecovery: boolean;
  theme: ThemeMode;
  view: View;
  filters: Filters;
  /** Item ids currently placed in each builder slot. */
  draft: Record<SlotKey, string[]>;

  addItem: (item: Omit<WardrobeItem, "id" | "createdAt">) => void;
  updateItem: (id: string, patch: Partial<WardrobeItem>) => void;
  deleteItem: (id: string) => void;

  saveOutfit: (name: string, notes: string, itemIds: string[]) => void;
  deleteOutfit: (id: string) => void;
  loadOutfitIntoDraft: (id: string) => void;

  updateProfile: (patch: Partial<UserProfile>) => void;
  resetAll: () => void;
  setAuthUser: (user: AuthUser | null) => void;
  setAuthChecked: (checked: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setPasswordRecovery: (active: boolean) => void;

  setTheme: (t: ThemeMode) => void;
  setView: (v: View) => void;
  setFilters: (patch: Partial<Filters>) => void;

  addToDraft: (itemId: string) => void;
  removeFromDraft: (slot: SlotKey, itemId: string) => void;
  clearDraft: () => void;
  setDraft: (draft: Record<SlotKey, string[]>) => void;
  /** Replace persisted fields from a remote snapshot (Supabase pull). */
  hydrateFromRemote: (data: {
    items: WardrobeItem[];
    outfits: Outfit[];
    profile?: UserProfile;
    theme: ThemeMode;
    draft: Record<SlotKey, string[]>;
  }) => void;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useWardrobe = create<WardrobeState>()(
  persist(
    (set, get) => ({
      items: demoItems,
      outfits: [],
      profile: { ...DEFAULT_PROFILE },
      authUser: null,
      authChecked: false,
      syncStatus: "offline" as SyncStatus,
      passwordRecovery: false,
      theme: "light",
      view: "wardrobe",
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
          items: data.items,
          outfits: data.outfits,
          profile: data.profile ?? get().profile,
          theme: data.theme,
          draft: data.draft,
        }),
    }),
    {
      name: "wardrobe-store-v1",
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<WardrobeState>),
        profile: {
          ...DEFAULT_PROFILE,
          ...((persisted as Partial<WardrobeState>)?.profile ?? {}),
        },
      }),
      // Persist data + preferences, not transient UI state like filters.
      partialize: (s) => ({
        items: s.items,
        outfits: s.outfits,
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
