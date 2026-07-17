"use client";

import { ChevronLeft, ExternalLink, Recycle } from "lucide-react";
import { useMemo, useState } from "react";
import { openExternalUrl } from "@/lib/platform";
import { RESALE_PLATFORMS, estimateResale, resaleSummary } from "@/lib/resale";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";

/**
 * "Refresh your closet" (AJA-157, Phase 2). A full-screen page listing the
 * pieces the user doesn't wear, each with a rough resale estimate and a Sell
 * button that deep-links into the chosen marketplace's listing flow (referral).
 * No listing API — the user finishes the listing on the platform.
 */
const itemImage = (it: WardrobeItem) => it.beautifiedImageUrl ?? it.imageUrl;

export function ResaleView({ onClose }: { onClose: () => void }) {
  const items = useWardrobe((s) => s.items);
  const [platformId, setPlatformId] = useState(RESALE_PLATFORMS[0].id);

  const summary = useMemo(() => resaleSummary(items), [items]);
  const platform = RESALE_PLATFORMS.find((p) => p.id === platformId) ?? RESALE_PLATFORMS[0];

  const sell = (it: WardrobeItem) => void openExternalUrl(platform.sellUrl(it));

  return (
    <div className="native-item-page native-page-in" role="dialog" aria-label="Refresh your closet">
      <div className="native-item-page-header">
        <button type="button" onClick={onClose} className="native-item-page-back" aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <span className="native-item-page-title">Refresh your closet</span>
        <span className="native-item-page-spacer" />
      </div>

      <div className="native-item-page-body space-y-4">
        {summary.items.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface-2 p-6 text-center">
            <Recycle size={26} className="mx-auto text-accent" />
            <p className="mt-2 text-base font-semibold text-foreground">You&apos;re wearing everything</p>
            <p className="mt-1 text-sm text-muted">Nothing sitting unworn right now — nice.</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-line bg-accent-soft p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                <Recycle size={13} /> Refresh your closet
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {summary.items.length} piece{summary.items.length === 1 ? "" : "s"}{" "}
                you haven&apos;t worn
              </p>
              <p className="mt-0.5 text-sm text-muted">
                Around <b>${summary.total}</b> if you resell them. Estimates are rough — you set the
                price when you list.
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted">List on</p>
              <div className="flex gap-2">
                {RESALE_PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatformId(p.id)}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      p.id === platformId
                        ? "bg-foreground text-background"
                        : "border border-line bg-surface text-muted"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {summary.items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-3 rounded-2xl border border-line p-2.5"
                >
                  <div className="h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={itemImage(it)} alt={it.name} className="h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted">
                      est. <b className="text-foreground">${estimateResale(it)}</b>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => sell(it)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-foreground"
                  >
                    Sell <ExternalLink size={12} />
                  </button>
                </div>
              ))}
            </div>

            <p className="pb-2 text-center text-[11px] text-muted">
              Opens {platform.name} to finish your listing. Prefer to give back? Most items are also
              welcome at local donation drop-offs.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
