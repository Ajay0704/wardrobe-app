"use client";

import { AlertTriangle, Check, ChevronLeft, Coins, Sparkles, X } from "lucide-react";
import { startTransition, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { analyzeSmartBuy, type SmartBuyResult } from "@/lib/smart-buy";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";

/**
 * Opt-in Smart Buy. Results open in a fixed overlay sheet so the item editor
 * never reflows (inline expand flipped the iOS native layout).
 */
export function SmartBuy({ item }: { item: WardrobeItem }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="smart-buy-trigger flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface px-3 py-3 text-sm font-medium text-foreground"
      >
        <Sparkles size={15} className="text-accent" aria-hidden />
        Check Smart Buy
      </button>
      {open && (
        <SmartBuySheet item={item} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function portal(node: ReactNode): ReactNode {
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

function SmartBuySheet({
  item,
  onClose,
}: {
  item: WardrobeItem;
  onClose: () => void;
}) {
  const items = useWardrobe((s) => s.items);
  const styleVibes = useWardrobe((s) => s.profile.styleVibes);
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const [result, setResult] = useState<SmartBuyResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Defer heavy closet scan off the tap frame so WKWebView doesn't hitch.
    const id = window.setTimeout(() => {
      startTransition(() => {
        try {
          setResult(analyzeSmartBuy(item, items, { styleVibes }));
        } catch (err) {
          console.warn("[SmartBuy] analyze failed", err);
          setError(true);
        }
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [item, items, styleVibes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const categoryLabel =
    CATEGORY_LABEL[item.category] ?? String(item.category ?? "Item");

  return portal(
    <div className="smart-buy-sheet" role="dialog" aria-modal="true" aria-label="Smart Buy">
      <header className="smart-buy-sheet-header">
        <button
          type="button"
          onClick={onClose}
          className="smart-buy-sheet-back"
          aria-label="Close Smart Buy"
        >
          <ChevronLeft size={22} strokeWidth={2} />
          <span>Back</span>
        </button>
        <h2 className="smart-buy-sheet-title">Smart Buy</h2>
        <button
          type="button"
          onClick={onClose}
          className="smart-buy-sheet-close"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>

      <div className="smart-buy-sheet-body">
        {error && (
          <p className="text-sm text-muted">
            Couldn&apos;t analyze this piece against your closet. Try again
            after saving.
          </p>
        )}
        {!error && !result && (
          <p className="text-sm text-muted">Checking your closet…</p>
        )}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 shrink-0 rounded-xl border border-line"
                style={{ backgroundColor: item.color || "#a8a29e" }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {item.name || "Item"}
                </p>
                <p className="truncate text-xs text-muted">
                  {categoryLabel}
                  {item.brand ? ` · ${item.brand}` : ""}
                  {typeof item.price === "number"
                    ? ` · ${formatMoney(item.price, currency, 0)}`
                    : ""}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${verdictClass(result.verdict)}`}
              >
                {result.verdictLabel}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Metric label="Pairs with" value={`${result.pairsWith.length}`} />
              <Metric
                label="Cost / wear"
                value={
                  result.costPerWear !== null
                    ? formatMoney(result.costPerWear, currency, 2)
                    : "—"
                }
              />
              <Metric label="New outfits" value={`+${result.newOutfits}`} />
            </div>

            {result.pairsWith.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted">
                  Goes with {result.pairsWith.length} piece
                  {result.pairsWith.length === 1 ? "" : "s"} you own
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.pairsWith.slice(0, 4).map(({ item: it }) => (
                    <div
                      key={it.id}
                      title={it.name}
                      className="flex h-12 w-10 flex-col overflow-hidden rounded-lg border border-line bg-surface-2"
                    >
                      <span
                        className="block h-7 w-full"
                        style={{ backgroundColor: it.color || "#a8a29e" }}
                      />
                      <span className="truncate px-0.5 py-0.5 text-[9px] leading-tight text-muted">
                        {it.name}
                      </span>
                    </div>
                  ))}
                  {result.pairsWith.length > 4 && (
                    <div className="flex h-12 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-xs text-muted">
                      +{result.pairsWith.length - 4}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2.5 border-t border-line pt-3">
              {result.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  {r.tone === "good" && (
                    <Check
                      size={18}
                      className="shrink-0 text-emerald-600"
                    />
                  )}
                  {r.tone === "warn" && (
                    <AlertTriangle
                      size={18}
                      className="shrink-0 text-amber-600"
                    />
                  )}
                  {r.tone === "info" && (
                    <Coins size={18} className="shrink-0 text-muted" />
                  )}
                  <span className="leading-snug">{r.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
  );
}

function verdictClass(verdict: SmartBuyResult["verdict"]): string {
  if (verdict === "buy") return "bg-accent-soft text-accent";
  if (verdict === "maybe")
    return "bg-amber-500/15 text-amber-700";
  return "bg-red-500/10 text-red-600";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-medium">{value}</p>
    </div>
  );
}
