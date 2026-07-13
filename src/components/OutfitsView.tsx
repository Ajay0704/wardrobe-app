"use client";

import { Check, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { outfitPayload } from "@/lib/chat";
import { outfitScore } from "@/lib/matching";
import { useWardrobe } from "@/lib/store";
import type { Outfit, WardrobeItem } from "@/lib/types";
import { formatDisplayDate } from "@/lib/types";
import { ShareToChatSheet } from "./chat/ShareToChatSheet";

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
  const [shareOutfit, setShareOutfit] = useState<Outfit | null>(null);

  const resolve = (ids: string[]) =>
    ids
      .map((id) => items.find((it) => it.id === id))
      .filter(Boolean) as WardrobeItem[];

  const scoreOf = (o: Outfit) => {
    const its = resolve(o.itemIds);
    return its.length >= 2 ? outfitScore(its) : null;
  };

  const sorted = useMemo(
    () => [...outfits].sort((a, b) => b.createdAt - a.createdAt),
    [outfits],
  );

  /**
   * The featured look crowns the page: highest match score wins, with
   * wear count then recency as tiebreakers. Falls back to the newest look
   * when nothing is scorable yet.
   */
  const featured = useMemo(() => {
    if (sorted.length === 0) return null;
    return [...sorted].sort((a, b) => {
      const sa = scoreOf(a) ?? -1;
      const sb = scoreOf(b) ?? -1;
      if (sb !== sa) return sb - sa;
      const wa = a.wearCount ?? 0;
      const wb = b.wearCount ?? 0;
      if (wb !== wa) return wb - wa;
      return b.createdAt - a.createdAt;
    })[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, items]);

  const rest = useMemo(
    () => sorted.filter((o) => o.id !== featured?.id),
    [sorted, featured],
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
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        Your collection
      </p>
      <h1 className="heading text-3xl">Outfits</h1>
      <p className="mt-0.5 text-sm text-muted">
        {sorted.length} look{sorted.length === 1 ? "" : "s"}
      </p>

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

      {featured && (
        <FeaturedLook
          outfit={featured}
          items={resolve(featured.itemIds)}
          score={scoreOf(featured)}
          onWore={() => wore(featured.id, featured.itemIds)}
          onEdit={() => editLook(featured.id)}
          onShare={() => setShareOutfit(featured)}
        />
      )}

      {shareOutfit && (
        <ShareToChatSheet
          kind="outfit"
          payload={outfitPayload(shareOutfit, resolve(shareOutfit.itemIds))}
          onClose={() => setShareOutfit(null)}
        />
      )}

      {rest.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {rest.map((outfit) => {
            const outfitItems = resolve(outfit.itemIds);
            const score = scoreOf(outfit);
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
                      aria-label="Send look"
                      onClick={() => setShareOutfit(outfit)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-foreground"
                    >
                      <Send size={13} />
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
      )}
    </div>
  );
}

/** The hero look at the top of the collection. */
function FeaturedLook({
  outfit,
  items,
  score,
  onWore,
  onEdit,
  onShare,
}: {
  outfit: Outfit;
  items: WardrobeItem[];
  score: number | null;
  onWore: () => void;
  onEdit: () => void;
  onShare: () => void;
}) {
  return (
    <article className="mt-5 overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="relative bg-surface-2/60">
        <span className="absolute left-3 top-3 z-10 rounded-full bg-foreground px-3 py-1 text-[11px] font-medium text-background">
          Featured
        </span>
        {score !== null && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-accent shadow-sm">
            {score}%
          </span>
        )}
        <HeroThumb items={items} />
      </div>

      <div className="flex items-end justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="heading truncate text-xl">{outfit.name}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {items.length} piece{items.length === 1 ? "" : "s"}
            {outfit.wearCount ? ` · worn ${outfit.wearCount}×` : ""}
            {outfit.lastWornAt
              ? ` · ${formatDisplayDate(outfit.lastWornAt)}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onWore}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground"
          >
            <Check size={15} /> Wore it
          </button>
          <button
            type="button"
            aria-label="Edit look"
            onClick={onEdit}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-foreground"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            aria-label="Send look"
            onClick={onShare}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-foreground"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

/** Large canvas-style board for the featured look. */
function HeroThumb({ items }: { items: WardrobeItem[] }) {
  const cells = items.slice(0, 4);
  if (cells.length <= 1) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center p-8">
        {cells[0] && <ThumbImg item={cells[0]} />}
      </div>
    );
  }
  return (
    <div className="grid aspect-[4/3] grid-cols-2 gap-3 p-6">
      {cells.map((it) => (
        <div
          key={it.id}
          className="flex items-center justify-center overflow-hidden"
        >
          <ThumbImg item={it} />
        </div>
      ))}
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
