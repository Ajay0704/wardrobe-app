"use client";

import { Check, Loader2, Sparkles, X } from "lucide-react";
import { useEffect } from "react";
import { cancelImports, discardPending } from "@/lib/import-queue";
import { useWardrobe } from "@/lib/store";

/**
 * Global background-import pill (AJA-236/237) — the AirDrop-style status chip that floats above
 * the tab bar. Three states: (1) progress while extracting/committing, (2) a persistent
 * "N items ready · Review" chip once extraction finishes (tap → review sheet), (3) a "N items
 * added" toast after commit. Mounted once at the app root (beside ClipLinkLoader); purely
 * presentational — the work lives in src/lib/import-queue.ts.
 */
export function ImportProgress() {
  const importStatus = useWardrobe((s) => s.importStatus);
  const pendingImports = useWardrobe((s) => s.pendingImports);
  const importReviewOpen = useWardrobe((s) => s.importReviewOpen);
  const setImportStatus = useWardrobe((s) => s.setImportStatus);
  const setImportReviewOpen = useWardrobe((s) => s.setImportReviewOpen);
  const setView = useWardrobe((s) => s.setView);

  const running = !!importStatus?.running;
  const reviewReady = !running && pendingImports.length > 0;
  const committedDone = !running && pendingImports.length === 0 && !!importStatus;

  // Auto-dismiss only the final "done" toast — never the persistent review-ready chip.
  useEffect(() => {
    if (!committedDone) return;
    const t = window.setTimeout(() => setImportStatus(null), 4200);
    return () => window.clearTimeout(t);
  }, [committedDone, setImportStatus]);

  // Hide the pill while the review sheet itself is open (avoid double UI).
  if (importReviewOpen) return null;
  if (!importStatus && pendingImports.length === 0) return null;

  const shell = "animate-fade-up fixed left-1/2 z-50 -translate-x-1/2";
  const shellStyle = { bottom: "calc(env(safe-area-inset-bottom) + 88px)" } as const;
  const chip =
    "flex items-center rounded-full bg-foreground/95 text-sm font-medium text-background shadow-lg shadow-black/25 backdrop-blur";

  if (running && importStatus) {
    const { phase, total, done } = importStatus;
    return (
      <div role="status" className={shell} style={shellStyle}>
        <div className={`${chip} gap-2.5 py-2 pl-4 pr-2`}>
          <Loader2 size={15} className="animate-spin" />
          <span>
            {phase === "commit" ? "Adding to closet" : "Extracting"}…{" "}
            {Math.min(done + 1, total)}/{total}
          </span>
          <button
            type="button"
            aria-label="Stop"
            onClick={cancelImports}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-background/20 transition-transform active:scale-90"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (reviewReady) {
    const n = pendingImports.length;
    return (
      <div role="status" className={shell} style={shellStyle}>
        <div className={`${chip} gap-1 py-1.5 pl-4 pr-1.5`}>
          <button
            type="button"
            onClick={() => setImportReviewOpen(true)}
            className="flex items-center gap-2 pr-1 transition-transform active:scale-95"
          >
            <Sparkles size={15} className="text-amber-300" />
            <span>
              {n} item{n === 1 ? "" : "s"} ready · Review
            </span>
          </button>
          <button
            type="button"
            aria-label="Discard"
            onClick={discardPending}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-background/20 transition-transform active:scale-90"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // committedDone
  const itemsAdded = importStatus?.itemsAdded ?? 0;
  const goToCloset = () => {
    if (itemsAdded > 0) setView("wardrobe");
    setImportStatus(null);
  };
  return (
    <div role="status" className={shell} style={shellStyle}>
      <button
        type="button"
        onClick={goToCloset}
        className={`${chip} gap-2 px-4 py-2 transition-transform active:scale-95`}
      >
        {itemsAdded > 0 && (
          <span className="animate-pop flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check size={13} strokeWidth={3} />
          </span>
        )}
        <span>
          {itemsAdded > 0
            ? `${itemsAdded} item${itemsAdded === 1 ? "" : "s"} added`
            : "No items found in those photos"}
        </span>
      </button>
    </div>
  );
}
