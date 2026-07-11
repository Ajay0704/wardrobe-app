"use client";

import { useEffect } from "react";
import { useWardrobe } from "@/lib/store";
import { slotForCategory, SLOT_CONFIG } from "@/lib/types";

/**
 * Loads a shared outfit from the `?outfit=` URL param on first mount.
 * The param is a base64-encoded JSON array of item ids.
 */
export function ShareLinkLoader() {
  const { items, setDraft, setView } = useWardrobe();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("outfit");
    if (!encoded) return;

    try {
      const ids = JSON.parse(atob(encoded)) as string[];
      if (!Array.isArray(ids)) return;

      const empty = (): Record<string, string[]> => ({
        top: [],
        bottom: [],
        dress: [],
        outerwear: [],
        shoes: [],
        accessories: [],
      });

      const draft = empty();
      for (const id of ids) {
        const item = items.find((it) => it.id === id);
        if (!item) continue;
        const slot = slotForCategory(item.category);
        const max = SLOT_CONFIG.find((s) => s.key === slot)?.max ?? 1;
        if (draft[slot].length < max) draft[slot].push(id);
      }

      setDraft(draft as ReturnType<typeof useWardrobe.getState>["draft"]);
      setView("builder");

      // Clean outfit param; keep other flags (e.g. native=1) if still present.
      const next = new URL(window.location.href);
      next.searchParams.delete("outfit");
      const qs = next.searchParams.toString();
      window.history.replaceState(
        {},
        "",
        `${next.pathname}${qs ? `?${qs}` : ""}${next.hash}`,
      );
    } catch {
      // Malformed share links are ignored silently.
    }
  }, [items, setDraft, setView]);

  return null;
}
