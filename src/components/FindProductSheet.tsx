"use client";

import { ChevronLeft, Search, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ProductCandidate } from "@/app/api/find-product/route";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { useWardrobe } from "@/lib/store";

function portal(node: ReactNode): ReactNode {
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

/**
 * Candidate picker for AJA-79 — fixed sheet so the item editor doesn't reflow.
 */
export function FindProductSheet({
  candidates,
  message,
  onPick,
  onClose,
}: {
  candidates: ProductCandidate[];
  message?: string;
  onPick: (c: ProductCandidate) => void;
  onClose: () => void;
}) {
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return portal(
    <div
      className="smart-buy-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Find product"
    >
      <header className="smart-buy-sheet-header">
        <button
          type="button"
          onClick={onClose}
          className="smart-buy-sheet-back"
          aria-label="Close"
        >
          <ChevronLeft size={22} strokeWidth={2} />
          <span>Back</span>
        </button>
        <h2 className="smart-buy-sheet-title">Find product</h2>
        <button
          type="button"
          onClick={onClose}
          className="smart-buy-sheet-close"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>

      <div className="smart-buy-sheet-body space-y-3">
        <p className="text-sm text-muted">
          Pick a listing to fill the product link and price. You can edit
          before saving.
        </p>

        {message && !candidates.length && (
          <p className="rounded-xl border border-line bg-surface-2 px-3 py-3 text-sm">
            {message}
          </p>
        )}

        {candidates.map((c) => (
          <button
            key={c.link}
            type="button"
            onClick={() => onPick(c)}
            className="flex w-full gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-accent/50"
          >
            <div className="h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
              {c.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.thumbnail}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted">
                  <Search size={16} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{c.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {c.source || new URL(c.link).hostname}
              </p>
              {(c.price != null || c.priceLabel) && (
                <p className="mt-1 text-sm text-accent">
                  {c.price != null
                    ? formatMoney(c.price, currency, 0)
                    : c.priceLabel}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>,
  );
}
