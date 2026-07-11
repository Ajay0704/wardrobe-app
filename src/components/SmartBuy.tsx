"use client";

import { AlertTriangle, Check, Coins } from "lucide-react";
import { analyzeSmartBuy } from "@/lib/smart-buy";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";

/**
 * "Smart Buy" — shows how a wishlist item fits the closet you already own
 * before you buy it: what it pairs with, its projected cost-per-wear, the gap
 * it fills, and any redundancy. Reuses the outfit builder's color engine.
 */
export function SmartBuy({ item }: { item: WardrobeItem }) {
  const items = useWardrobe((s) => s.items);
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const a = analyzeSmartBuy(item, items);

  const verdictClass =
    a.verdict === "buy"
      ? "bg-accent-soft text-accent"
      : a.verdict === "maybe"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-red-500/10 text-red-600 dark:text-red-400";

  const swatches = a.pairsWith.slice(0, 6);
  const extra = a.pairsWith.length - swatches.length;

  return (
    <div className="space-y-5">
      {/* Item header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              className="block h-full w-full"
              style={{ backgroundColor: item.color }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.name}</p>
          <p className="truncate text-xs text-muted">
            {CATEGORY_LABEL[item.category]}
            {item.brand ? ` · ${item.brand}` : ""}
            {typeof item.price === "number"
              ? ` · ${formatMoney(item.price, currency, 0)}`
              : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${verdictClass}`}
        >
          {a.verdictLabel}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Pairs with" value={`${a.pairsWith.length}`} />
        <Metric
          label="Cost / wear"
          value={a.costPerWear !== null ? formatMoney(a.costPerWear, currency, 2) : "—"}
        />
        <Metric label="New outfits" value={`+${a.newOutfits}`} />
      </div>

      {/* Goes-with */}
      {swatches.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted">
            Goes with pieces you already own
          </p>
          <div className="flex flex-wrap gap-2">
            {swatches.map(({ item: it }) => (
              <div
                key={it.id}
                title={it.name}
                className="h-14 w-11 overflow-hidden rounded-lg border border-line bg-surface-2"
              >
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.imageUrl}
                    alt={it.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    className="block h-full w-full"
                    style={{ backgroundColor: it.color }}
                  />
                )}
              </div>
            ))}
            {extra > 0 && (
              <div className="flex h-14 w-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-xs text-muted">
                +{extra}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reasons */}
      <div className="space-y-2.5 border-t border-line pt-4">
        {a.reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-2.5 text-sm">
            {r.tone === "good" && (
              <Check size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            {r.tone === "warn" && (
              <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            {r.tone === "info" && (
              <Coins size={18} className="shrink-0 text-muted" />
            )}
            <span className="leading-snug">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-medium">{value}</p>
    </div>
  );
}
