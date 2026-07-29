"use client";

import { Plus, ScanFace, Search, Star, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  inCollection,
  matchesQuery,
  presentCollections,
  wishPieceCount,
  wearSummary,
  type CollectionKey,
} from "@/lib/outfit-collections";
import { useWardrobe } from "@/lib/store";
import type { TryOnGarment } from "@/lib/tryon";
import type { Outfit, WardrobeItem } from "@/lib/types";
import { OutfitBoardThumb } from "./OutfitBoardThumb";
import { TryOnView } from "./explore/TryOnView";
import { AskToStyleSheet } from "./styling/AskToStyleSheet";
import { StylingSessions } from "./styling/StylingSessions";

const itemImage = (it: WardrobeItem): string | undefined =>
  it.beautifiedImageUrl ?? it.imageUrl;

function garmentsForOutfit(outfit: Outfit, items: WardrobeItem[]): TryOnGarment[] {
  const out: TryOnGarment[] = [];
  for (const id of outfit.itemIds) {
    const it = items.find((x) => x.id === id);
    if (!it) continue;
    const image = itemImage(it);
    if (!image) continue;
    out.push({
      image,
      label: [it.colorName, it.category].filter(Boolean).join(" ") || it.name,
    });
  }
  return out;
}

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
  const [askOpen, setAskOpen] = useState(false);
  const [tryOnGarments, setTryOnGarments] = useState<TryOnGarment[] | null>(null);
  // Bumped after an ask is sent so the session list refetches without a round trip
  // through realtime — the card has to appear the instant you send.
  const [sessionsKey, setSessionsKey] = useState(0);

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
      <StylingSessions refreshKey={sessionsKey} />

      <button
        type="button"
        onClick={newLook}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]"
      >
        <Plus size={17} /> New look
      </button>

      <button
        type="button"
        onClick={() => setAskOpen(true)}
        className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium transition-transform active:scale-[0.98]"
      >
        <Wand2 size={16} /> Ask a friend to style me
      </button>

      <AskToStyleSheet
        open={askOpen}
        onClose={() => setAskOpen(false)}
        onAsked={() => setSessionsKey((k) => k + 1)}
      />

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
                  onTryOn={() => {
                    const g = garmentsForOutfit(outfit, items);
                    if (g.length) setTryOnGarments(g);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tryOnGarments && (
        <TryOnView garments={tryOnGarments} onClose={() => setTryOnGarments(null)} />
      )}
    </div>
  );
}

function LookCard({
  outfit,
  items,
  onOpen,
  onFavorite,
  onTryOn,
}: {
  outfit: Outfit;
  items: WardrobeItem[];
  onOpen: () => void;
  onFavorite: () => void;
  onTryOn: () => void;
}) {
  const wish = wishPieceCount(outfit, items);
  const never = !outfit.wearCount;
  const canTryOn = garmentsForOutfit(outfit, items).length > 0;
  return (
    <article className="animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${outfit.name}`}
        className="block w-full text-left transition-transform active:scale-[0.98]"
      >
        <div className="relative">
          <OutfitBoardThumb
            outfit={outfit}
            items={items}
            className="aspect-[4/5] w-full bg-surface-2/50"
          />
          {wish > 0 && (
            <span className="absolute left-2 top-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
              {wish === 1 ? "1 to buy" : `${wish} to buy`}
            </span>
          )}
        </div>
      </button>
      <div className="flex items-start gap-1.5 px-2.5 pt-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
          tabIndex={-1}
        >
          <h3 className="truncate text-sm font-medium">{outfit.name}</h3>
          <p
            className={`mt-0.5 truncate text-xs ${never || wish ? "text-amber-700/80" : "text-muted"}`}
          >
            {wearSummary(outfit, items)}
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
      <div className="px-2.5 pb-2.5 pt-1.5">
        <button
          type="button"
          disabled={!canTryOn}
          onClick={(e) => {
            e.stopPropagation();
            onTryOn();
          }}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 text-xs font-medium transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ScanFace size={14} /> Try it on me
        </button>
      </div>
    </article>
  );
}
