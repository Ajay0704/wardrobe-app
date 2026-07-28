"use client";

import { Plus, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import {
  inCollection,
  matchesQuery,
  presentCollections,
  wearSummary,
  type CollectionKey,
} from "@/lib/outfit-collections";
import { useWardrobe } from "@/lib/store";
import type { Outfit, WardrobeItem } from "@/lib/types";
import { OutfitBoardThumb } from "./OutfitBoardThumb";

/**
 * The looks library (AJA-239). Outfits is now purely a place to browse, find and reuse the
 * looks you've saved — Today owns "what do I wear now" and Calendar owns planning, so the old
 * "This week" planning block (and its server trip fetch) moved out entirely.
 *
 * Cards render the REAL saved board via OutfitBoardThumb, and show wear history instead of the
 * old "88%" — which was colour-only and, in practice, the hard-coded neutral bucket.
 */
export function OutfitsView() {
  const outfits = useWardrobe((s) => s.outfits);
  const items = useWardrobe((s) => s.items);
  const setView = useWardrobe((s) => s.setView);
  const clearDraft = useWardrobe((s) => s.clearDraft);
  const toggleOutfitFavorite = useWardrobe((s) => s.toggleOutfitFavorite);
  const openOutfitDetail = useWardrobe((s) => s.openOutfitDetail);

  const [collection, setCollection] = useState<CollectionKey>("all");
  const [query, setQuery] = useState("");

  const chips = useMemo(
    () => presentCollections(outfits, items),
    [outfits, items],
  );

  const visible = useMemo(() => {
    const active = chips.some((c) => c.collection.key === collection)
      ? collection
      : "all";
    return [...outfits]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((o) => inCollection(active, o, items) && matchesQuery(o, items, query));
  }, [outfits, items, collection, query, chips]);

  const newLook = () => {
    clearDraft();
    setView("builder");
  };

  return (
    <div className="pb-6">
      <button
        type="button"
        onClick={newLook}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]"
      >
        <Plus size={17} /> New look
      </button>

      {outfits.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center">
          <h2 className="heading text-lg">No looks yet</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
            Compose your first outfit on the canvas — drag your pieces, arrange
            them, and save the look here.
          </p>
          <button
            type="button"
            onClick={newLook}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground"
          >
            <Plus size={15} /> New look
          </button>
        </div>
      ) : (
        <>
          <div className="relative mt-3">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search looks and pieces"
              aria-label="Search looks"
              className="h-10 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chips.map(({ collection: c, count }) => {
              const on = c.key === collection;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCollection(c.key)}
                  className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors active:scale-95 ${
                    on
                      ? "border-accent bg-accent font-medium text-accent-foreground"
                      : "border-line bg-surface text-foreground"
                  }`}
                >
                  {c.key === "favorites" && <Star size={13} />}
                  {c.label}
                  <span className="text-xs opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted">
              No looks match that.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visible.map((outfit) => (
                <LookCard
                  key={outfit.id}
                  outfit={outfit}
                  items={items}
                  onOpen={() => openOutfitDetail(outfit.id)}
                  onFavorite={() => toggleOutfitFavorite(outfit.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LookCard({
  outfit,
  items,
  onOpen,
  onFavorite,
}: {
  outfit: Outfit;
  items: WardrobeItem[];
  onOpen: () => void;
  onFavorite: () => void;
}) {
  const never = !outfit.wearCount;
  return (
    <article className="animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${outfit.name}`}
        className="block w-full text-left transition-transform active:scale-[0.98]"
      >
        <OutfitBoardThumb
          outfit={outfit}
          items={items}
          className="aspect-[4/5] w-full bg-surface-2/50"
        />
      </button>
      <div className="flex items-start gap-1.5 px-2.5 pb-2.5 pt-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
          tabIndex={-1}
        >
          <h3 className="truncate text-sm font-medium">{outfit.name}</h3>
          <p
            className={`mt-0.5 truncate text-xs ${never ? "text-amber-700/80" : "text-muted"}`}
          >
            {wearSummary(outfit)}
          </p>
        </button>
        <button
          type="button"
          onClick={onFavorite}
          aria-pressed={!!outfit.favorite}
          aria-label={outfit.favorite ? "Remove from favourites" : "Add to favourites"}
          className={`shrink-0 p-0.5 transition-transform active:scale-90 ${
            outfit.favorite ? "text-amber-500" : "text-muted/50"
          }`}
        >
          <Star size={17} fill={outfit.favorite ? "currentColor" : "none"} />
        </button>
      </div>
    </article>
  );
}
