"use client";

import { ExternalLink, Heart, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { ColorDot, MatchBadge } from "./ui";

/**
 * Image-first card used in every grid. `matchScore` (when provided) renders
 * the green/amber/red harmony indicator against the current outfit draft.
 * Cards are draggable so the outfit builder supports drag-and-drop too.
 */
export function ItemCard({
  item,
  onEdit,
  matchScore,
  compact,
}: {
  item: WardrobeItem;
  onEdit?: (item: WardrobeItem) => void;
  matchScore?: number;
  compact?: boolean;
}) {
  const { deleteItem, updateItem, addToDraft, setView } = useWardrobe();
  const [imgError, setImgError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addAndGo = () => {
    addToDraft(item.id);
    if (!compact) setView("builder");
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/item-id", item.id);
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    // Custom drag ghost so the browser doesn't grab the <img> alone.
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 40, 52);
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => (compact ? addAndGo() : onEdit?.(item))}
      title={compact ? "Add to outfit" : "Edit item"}
      className="group animate-fade-up cursor-pointer overflow-hidden rounded-2xl border border-line bg-surface transition-shadow active:cursor-grabbing hover:shadow-lg hover:shadow-black/5"
    >
      {/* Image area */}
      <div className="relative aspect-[3/4] overflow-hidden bg-surface-2">
        {imgError ? (
          <div
            className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-muted"
            style={{ backgroundColor: `${item.color}22` }}
          >
            Image unavailable — edit the item to upload a new one.
          </div>
        ) : (
          // Plain <img>: URLs come from arbitrary user-provided hosts, which
          // next/image would require allowlisting per-domain.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            draggable={false}
            loading="lazy"
            onError={() => setImgError(true)}
            className="pointer-events-none h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        )}

        {/* Builder: click + only — hover chrome blocks drag on compact cards */}
        {!compact && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/50 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <CardAction title="Add to outfit" onClick={addAndGo}>
            <Plus size={15} />
          </CardAction>
          <CardAction
            title={item.favorite ? "Remove from favourites" : "Add to favourites"}
            onClick={() => updateItem(item.id, { favorite: !item.favorite })}
          >
            <Heart
              size={14}
              className={item.favorite ? "fill-red-500 text-red-500" : ""}
            />
          </CardAction>
          <CardAction
            title={confirmDelete ? "Click again to confirm" : "Delete"}
            onClick={() =>
              confirmDelete ? deleteItem(item.id) : setConfirmDelete(true)
            }
            danger={confirmDelete}
          >
            <Trash2 size={14} />
          </CardAction>
        </div>
        )}

        {/* Compact builder cards: always-visible add button, doesn't block drag */}
        {compact && (
          <button
            type="button"
            title="Add to outfit"
            onClick={(e) => {
              e.stopPropagation();
              addAndGo();
            }}
            className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-neutral-800 shadow-sm transition hover:bg-white"
          >
            <Plus size={14} />
          </button>
        )}

        {matchScore !== undefined && (
          <div className="absolute left-2 top-2">
            <MatchBadge score={matchScore} />
          </div>
        )}
        {item.wishlist && (
          <div
            className={`absolute left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur ${
              matchScore !== undefined ? "top-9" : "top-2"
            }`}
          >
            Wishlist
          </div>
        )}
        {!compact && item.favorite && (
          <div className="absolute right-2 top-2 rounded-full bg-black/45 p-1.5 backdrop-blur">
            <Heart size={12} className="fill-red-500 text-red-500" />
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          {item.productUrl ? (
            <a
              href={item.productUrl}
              target="_blank"
              rel="noreferrer"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              title="View product"
              className="flex min-w-0 items-center gap-1 text-sm font-medium transition-colors hover:text-accent"
            >
              <span className="truncate">{item.name}</span>
              <ExternalLink size={12} className="shrink-0 opacity-60" />
            </a>
          ) : (
            <p className="truncate text-sm font-medium">{item.name}</p>
          )}
          <ColorDot color={item.color} name={item.colorName} />
        </div>
        <p className="text-xs text-muted">
          {CATEGORY_LABEL[item.category]}
          {item.brand ? ` · ${item.brand}` : ""}
          {item.price !== undefined ? ` · $${item.price}` : ""}
        </p>
        {!compact && item.tags.length > 0 && (
          <p className="truncate text-[11px] capitalize text-muted/80">
            {item.tags.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

function CardAction({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded-full p-2 backdrop-blur transition-colors ${
        danger
          ? "bg-red-500 text-white"
          : "bg-white/85 text-neutral-800 hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}
