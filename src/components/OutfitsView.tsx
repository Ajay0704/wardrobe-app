"use client";

import { Pencil, Trash2, Wand2 } from "lucide-react";
import { useMemo } from "react";
import { outfitScore } from "@/lib/matching";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { OutfitPreview } from "./OutfitPreview";
import { Button, EmptyState, MatchBadge } from "./ui";

export function OutfitsView() {
  const { outfits, items, loadOutfitIntoDraft, deleteOutfit } = useWardrobe();

  const resolve = (ids: string[]) =>
    ids
      .map((id) => items.find((it) => it.id === id))
      .filter(Boolean) as WardrobeItem[];

  const sorted = useMemo(
    () => [...outfits].sort((a, b) => b.createdAt - a.createdAt),
    [outfits],
  );

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No saved outfits yet"
        subtitle="Build a look in the Outfit Builder and save your favorites here."
        action={
          <Button onClick={() => useWardrobe.getState().setView("builder")}>
            <Wand2 size={15} /> Open builder
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="heading text-2xl">Saved outfits</h2>
        <p className="mt-1 text-sm text-muted">
          {sorted.length} look{sorted.length === 1 ? "" : "s"} in your collection
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((outfit) => {
          const outfitItems = resolve(outfit.itemIds);
          const score =
            outfitItems.length >= 2 ? outfitScore(outfitItems) : null;

          return (
            <article
              key={outfit.id}
              className="animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <OutfitPreview items={outfitItems} compact showScore={false} />

              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{outfit.name}</h3>
                    {outfit.notes && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                        {outfit.notes}
                      </p>
                    )}
                  </div>
                  {score !== null && <MatchBadge score={score} />}
                </div>

                <p className="text-xs text-muted">
                  {outfitItems.length} piece
                  {outfitItems.length === 1 ? "" : "s"}
                  {outfitItems.length > 0 &&
                    ` · ${outfitItems.map((it) => it.name).join(", ")}`}
                </p>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1 !py-1.5 text-xs"
                    onClick={() => loadOutfitIntoDraft(outfit.id)}
                  >
                    <Pencil size={13} /> Edit in builder
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5"
                    onClick={() => deleteOutfit(outfit.id)}
                    title="Delete outfit"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
