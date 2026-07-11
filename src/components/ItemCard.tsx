"use client";

import { Check, ExternalLink, Heart, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useWardrobe } from "@/lib/store";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { affiliateUrl } from "@/lib/affiliate";
import { agentLog } from "@/lib/agent-log";
import { isNativeApp, openExternalUrl } from "@/lib/platform";
import type { WardrobeItem } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { useIsNativeApp } from "./NativeAppClass";
import { RediscoverModal } from "./RediscoverModal";
import { ColorDot, MatchBadge } from "./ui";

/**
 * Image-first card used in every grid. `matchScore` (when provided) renders
 * the green/amber/red harmony indicator against the current outfit draft.
 * Cards are draggable on the website so the outfit builder supports drag-and-drop;
 * drag is disabled in the native app (iOS drag gestures fight tap-to-edit).
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
  const { deleteItem, updateItem, addToDraft, setView, logWear } = useWardrobe();
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const isNative = useIsNativeApp();
  const [imgError, setImgError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [styling, setStyling] = useState(false);

  const addAndGo = () => {
    addToDraft(item.id);
    if (!compact) setView("builder");
  };

  const openEditor = () => {
    // #region agent log
    agentLog("D", "ItemCard.tsx:openEditor", "Item card tapped", {
      itemId: item.id,
      wishlist: !!item.wishlist,
      hasProductUrl: !!item.productUrl,
      isNativeHook: isNative,
      isNativeAppFn: isNativeApp(),
      htmlNative: document.documentElement.classList.contains("native-app"),
      compact: !!compact,
    });
    // #endregion
    if (compact) addAndGo();
    else onEdit?.(item);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/item-id", item.id);
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 40, 52);
    }
  };

  const openProduct = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // #region agent log
    agentLog("C", "ItemCard.tsx:openProduct", "Product link opened", {
      hasUrl: !!item.productUrl,
      isNativeHook: isNative,
    });
    // #endregion
    const url = affiliateUrl(item.productUrl);
    if (url) void openExternalUrl(url);
  };

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      draggable={!isNative && !compact}
      onDragStart={isNative ? undefined : handleDragStart}
      onClick={openEditor}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openEditor();
        }
      }}
      title={compact ? "Add to outfit" : "Edit item"}
      className="group animate-fade-up cursor-pointer overflow-hidden rounded-2xl border border-line bg-surface transition-shadow active:cursor-grabbing hover:shadow-lg hover:shadow-black/5"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-surface-2">
        {imgError ? (
          <div
            className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-muted"
            style={{ backgroundColor: `${item.color}22` }}
          >
            Image unavailable — edit the item to upload a new one.
          </div>
        ) : (
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

        {!compact && !isNative && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/50 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <CardAction title="Add to outfit" onClick={addAndGo}>
              <Plus size={15} />
            </CardAction>
            {!item.wishlist && (
              <CardAction
                title="3 ways to style this"
                onClick={() => setStyling(true)}
              >
                <Sparkles size={14} />
              </CardAction>
            )}
            {!item.wishlist && (
              <CardAction
                title="I wore this today"
                onClick={() => logWear({ itemIds: [item.id] })}
              >
                <Check size={14} />
              </CardAction>
            )}
            <CardAction
              title={
                item.favorite ? "Remove from favourites" : "Add to favourites"
              }
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

      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <ColorDot color={item.color} name={item.colorName} />
        </div>
        <p className="text-xs text-muted">
          {CATEGORY_LABEL[item.category]}
          {item.brand ? ` · ${item.brand}` : ""}
          {item.price !== undefined ? ` · ${formatMoney(item.price, currency, 0)}` : ""}
          {!item.wishlist && item.wearCount
            ? ` · ${item.wearCount}× worn`
            : ""}
        </p>
        {/* Shop link only on website cards — native opens it from the editor
            to avoid accidental Safari / layout jumps from the grid. */}
        {!compact && !isNative && item.productUrl && (
          <button
            type="button"
            onClick={openProduct}
            title="View product page"
            className="flex items-center gap-1 pt-0.5 text-[11px] font-medium text-accent"
          >
            <ExternalLink size={11} />
            Open product page
          </button>
        )}
        {!compact && item.tags.length > 0 && (
          <p className="truncate text-[11px] capitalize text-muted/80">
            {item.tags.join(" · ")}
          </p>
        )}
      </div>
    </div>
    {styling && (
      <RediscoverModal anchor={item} onClose={() => setStyling(false)} />
    )}
    </>
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
