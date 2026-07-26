"use client";

import { Check, ExternalLink, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { affiliateUrl } from "@/lib/affiliate";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { openExternalUrl } from "@/lib/platform";
import { useWardrobe } from "@/lib/store";
import { CATEGORY_LABEL, type WardrobeItem } from "@/lib/types";

/**
 * Full-screen photo viewer for a wardrobe item (AJA-204). Tapping a card in any
 * grid opens this — the piece shown large on a dark backdrop — with Edit and the
 * common actions one tap away, so "look at it" no longer means "jump into the form".
 */
export function ItemPhotoViewer({
  item,
  onEdit,
  onClose,
}: {
  item: WardrobeItem;
  onEdit: () => void;
  onClose: () => void;
}) {
  const addToDraft = useWardrobe((s) => s.addToDraft);
  const setView = useWardrobe((s) => s.setView);
  const logWear = useWardrobe((s) => s.logWear);
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const [imgError, setImgError] = useState(false);
  const [wore, setWore] = useState(false);

  // Escape to close + lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const buyUrl = affiliateUrl(item.productUrl);
  const meta = [item.brand, CATEGORY_LABEL[item.category]]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X size={22} />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          <Pencil size={15} /> Edit
        </button>
      </div>

      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex flex-1 items-center justify-center overflow-hidden px-3"
      >
        {imgError ? (
          <span className="px-8 text-center text-sm text-white/60">
            Image unavailable — tap Edit to upload a new one.
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            onClick={(e) => e.stopPropagation()}
            onError={() => setImgError(true)}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        )}
      </button>

      <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3 text-white">
        <div className="mb-3">
          <p className="text-lg font-medium">{item.name}</p>
          <p className="mt-0.5 text-sm text-white/60">
            {meta}
            {item.price != null ? `${meta ? " · " : ""}${formatMoney(item.price, currency)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              addToDraft(item.id);
              setView("builder");
              onClose();
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/12 py-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            <Plus size={16} /> Add to outfit
          </button>
          {!item.wishlist && (
            <button
              type="button"
              onClick={() => {
                logWear({ itemIds: [item.id] });
                setWore(true);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/12 py-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              {wore ? (
                <>
                  <Check size={16} /> Logged
                </>
              ) : (
                "Wore it"
              )}
            </button>
          )}
          {buyUrl && (
            <button
              type="button"
              onClick={() => void openExternalUrl(buyUrl)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              <ExternalLink size={15} /> Buy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
