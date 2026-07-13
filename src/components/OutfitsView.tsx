"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { outfitScore } from "@/lib/matching";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { formatDisplayDate } from "@/lib/types";

export function OutfitsView() {
  const {
    outfits,
    items,
    loadOutfitIntoDraft,
    deleteOutfit,
    logWear,
    setView,
    clearDraft,
  } = useWardrobe();
  const [toast, setToast] = useState<string | null>(null);

  const resolve = (ids: string[]) =>
    ids
      .map((id) => items.find((it) => it.id === id))
      .filter(Boolean) as WardrobeItem[];

  const sorted = useMemo(
    () => [...outfits].sort((a, b) => b.createdAt - a.createdAt),
    [outfits],
  );

  const newLook = () => {
    clearDraft();
    setView("builder");
  };

  const wore = (outfitId: string, itemIds: string[]) => {
    logWear({ outfitId, itemIds });
    setToast("Logged as worn today");
    window.setTimeout(() => setToast(null), 2000);
  };

  const editLook = (id: string) => {
    loadOutfitIntoDraft(id);
    setView("builder");
  };

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <h1 className="heading text-2xl">No looks yet</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
          Compose your first outfit on the canvas — drag your pieces, arrange
          them, and save the look here.
        </p>
        <button
          type="button"
          onClick={newLook}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-accent-foreground"
        >
          <Plus size={16} /> New look
        </button>
      </div>
    );
  }

  return (
    <div className="pb-6">
      <div>
        <h1 className="heading text-2xl">Outfits</h1>
        <p className="mt-0.5 text-sm text-muted">
          {sorted.length} look{sorted.length === 1 ? "" : "s"} in your collection
        </p>
      </div>

      <button
        type="button"
        onClick={newLook}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground"
      >
        <Plus size={17} /> New look
      </button>

      {toast && (
        <p className="mt-4 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
          {toast}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {sorted.map((outfit) => {
          const outfitItems = resolve(outfit.itemIds);
          const score =
            outfitItems.length >= 2 ? outfitScore(outfitItems) : null;
          return (
            <article
              key={outfit.id}
              className="overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <div className="relative">
                <LookThumb items={outfitItems} />
                {score !== null && (
                  <span className="absolute right-2 top-2 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-accent shadow-sm">
                    {score}%
                  </span>
                )}
              </div>

              <div className="space-y-2 p-3">
                <div>
                  <h3 className="truncate font-medium">{outfit.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    {outfitItems.length} piece
                    {outfitItems.length === 1 ? "" : "s"}
                    {outfit.wearCount ? ` · worn ${outfit.wearCount}×` : ""}
                    {outfit.lastWornAt
                      ? ` · ${formatDisplayDate(outfit.lastWornAt)}`
                      : ""}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => wore(outfit.id, outfit.itemIds)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-xs font-medium text-accent-foreground"
                  >
                    <Check size={13} /> I wore this
                  </button>
                  <button
                    type="button"
                    aria-label="Edit look"
                    onClick={() => editLook(outfit.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-foreground"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete look"
                    onClick={() => deleteOutfit(outfit.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** Compact canvas-style thumbnail — item cutouts on a soft board. */
function LookThumb({ items }: { items: WardrobeItem[] }) {
  const cells = items.slice(0, 4);
  if (cells.length <= 1) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center bg-surface-2/50 p-5">
        {cells[0] && <ThumbImg item={cells[0]} />}
      </div>
    );
  }
  return (
    <div className="grid aspect-[4/5] grid-cols-2 gap-1 bg-surface-2/50 p-2">
      {cells.map((it) => (
        <div key={it.id} className="flex items-center justify-center overflow-hidden">
          <ThumbImg item={it} />
        </div>
      ))}
    </div>
  );
}

function ThumbImg({ item }: { item: WardrobeItem }) {
  const [err, setErr] = useState(false);
  if (err || !item.imageUrl) {
    return <div className="h-full w-full rounded-lg" style={{ background: item.color }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt={item.name}
      onError={() => setErr(true)}
      className="max-h-full max-w-full object-contain"
    />
  );
}
