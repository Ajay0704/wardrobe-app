"use client";

import { Check, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { cancelImports } from "@/lib/import-queue";
import { useWardrobe } from "@/lib/store";

/**
 * Global background-import pill (AJA-236) — the AirDrop-style status chip that floats above
 * the tab bar while photos are being turned into closet items in the background. Mounted once
 * at the app root (beside ClipLinkLoader) so it stays visible across every screen. Purely
 * presentational: reads `importStatus` and calls `cancelImports()`; the work lives in
 * src/lib/import-queue.ts.
 */
export function ImportProgress() {
  const importStatus = useWardrobe((s) => s.importStatus);
  const setImportStatus = useWardrobe((s) => s.setImportStatus);
  const setView = useWardrobe((s) => s.setView);

  const finished = !!importStatus && !importStatus.running;

  // Auto-dismiss the "done" pill after a few seconds (mirrors ClipLinkLoader's 4.2s toast).
  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => setImportStatus(null), 4200);
    return () => window.clearTimeout(t);
  }, [finished, setImportStatus]);

  if (!importStatus) return null;

  const { total, done, itemsAdded, running } = importStatus;

  const goToCloset = () => {
    if (itemsAdded > 0) setView("wardrobe");
    setImportStatus(null);
  };

  const doneLabel =
    itemsAdded > 0
      ? `${itemsAdded} item${itemsAdded === 1 ? "" : "s"} added`
      : "No items found in those photos";

  return (
    <div
      role="status"
      className="animate-fade-up fixed left-1/2 z-50 -translate-x-1/2"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)" }}
    >
      {running ? (
        <div className="flex items-center gap-2.5 rounded-full bg-foreground/95 py-2 pl-4 pr-2 text-sm font-medium text-background shadow-lg shadow-black/25 backdrop-blur">
          <Loader2 size={15} className="animate-spin" />
          <span>
            Adding photos… {Math.min(done + 1, total)}/{total}
          </span>
          <button
            type="button"
            aria-label="Stop importing"
            onClick={cancelImports}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-background/20 transition-transform active:scale-90"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={goToCloset}
          className="flex items-center gap-2 rounded-full bg-foreground/95 px-4 py-2 text-sm font-medium text-background shadow-lg shadow-black/25 backdrop-blur transition-transform active:scale-95"
        >
          {itemsAdded > 0 && (
            <span className="animate-pop flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check size={13} strokeWidth={3} />
            </span>
          )}
          <span>{doneLabel}</span>
        </button>
      )}
    </div>
  );
}
