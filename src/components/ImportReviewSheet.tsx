"use client";

import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { AUTO_BEAUTIFY_CATEGORIES } from "@/lib/beautify";
import { commitPending, discardPending } from "@/lib/import-queue";
import { useWardrobe, type PendingImport } from "@/lib/store";
import { CATEGORY_LABEL } from "@/lib/types";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./ui";

/**
 * Review sheet for background photo import (AJA-237). After extraction the pill shows
 * "N items ready · Review"; tapping it opens this sheet — a grid of extracted cutouts, all
 * pre-selected. The user deselects bad cutouts and flips ✨ Beautify on the ones they want as
 * clean product shots, then "Add to closet" commits the picks in the background (beautifying the
 * flagged ones during add). Mounted once at the app root beside ImportProgress.
 */
export function ImportReviewSheet() {
  const open = useWardrobe((s) => s.importReviewOpen);
  const setOpen = useWardrobe((s) => s.setImportReviewOpen);
  const pending = useWardrobe((s) => s.pendingImports);

  return (
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Review items">
      {open && <ReviewBody pending={pending} onClose={() => setOpen(false)} />}
    </BottomSheet>
  );
}

function ReviewBody({
  pending,
  onClose,
}: {
  pending: PendingImport[];
  onClose: () => void;
}) {
  // Missing id ⇒ included by default (deselect the bad ones), so late-finishing photos are
  // auto-kept without a sync effect. Beautify is opt-in per item.
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [beautifyOn, setBeautifyOn] = useState<Record<string, boolean>>({});
  const isOn = (id: string) => include[id] ?? true;

  const selectedCount = pending.filter((p) => isOn(p.id)).length;

  const add = () => {
    const picks = pending
      .filter((p) => isOn(p.id))
      .map((p) => ({ id: p.id, beautify: !!beautifyOn[p.id] }));
    void commitPending(picks);
    onClose();
  };

  if (!pending.length) {
    return <p className="py-8 text-center text-sm text-muted">Nothing to review.</p>;
  }

  return (
    <div className="animate-fade-up space-y-4">
      <p className="text-sm text-muted">
        Tap to keep or remove. Flip ✨ to add an item as a clean product shot.
      </p>
      <div className="grid max-h-[58vh] grid-cols-2 gap-3 overflow-y-auto pr-0.5 sm:grid-cols-3">
        {pending.map((p) => {
          const on = isOn(p.id);
          const canBeautify = AUTO_BEAUTIFY_CATEGORIES.has(p.category);
          const bOn = !!beautifyOn[p.id];
          return (
            <div
              key={p.id}
              className={`relative overflow-hidden rounded-2xl border transition-all ${
                on ? "border-accent" : "border-line/60 opacity-45"
              }`}
            >
              <button
                type="button"
                onClick={() => setInclude((s) => ({ ...s, [p.id]: !(s[p.id] ?? true) }))}
                className="block w-full text-left"
                aria-label={on ? `Remove ${p.name}` : `Keep ${p.name}`}
              >
                <div className="aspect-square bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.cutoutUrl}
                    alt={p.name}
                    className="h-full w-full object-contain p-1.5"
                  />
                </div>
                <div className="px-2 py-1.5">
                  <span className="block truncate text-xs text-muted">
                    {CATEGORY_LABEL[p.category]}
                  </span>
                </div>
                <span
                  className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border ${
                    on
                      ? "animate-pop border-accent bg-accent text-white"
                      : "border-line bg-surface/80 text-transparent"
                  }`}
                >
                  <Check size={13} className="mx-auto" />
                </span>
              </button>
              {canBeautify && (
                <button
                  type="button"
                  onClick={() => setBeautifyOn((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  aria-label={bOn ? "Don't beautify" : "Beautify"}
                  className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border transition-transform active:scale-90 ${
                    bOn
                      ? "border-amber-400 bg-amber-400 text-white"
                      : "border-line bg-surface/80 text-muted"
                  }`}
                >
                  <Sparkles size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Button
          variant="outline"
          onClick={() => {
            discardPending();
            onClose();
          }}
          className="mr-auto"
        >
          Discard
        </Button>
        <Button onClick={add} disabled={selectedCount === 0}>
          Add {selectedCount || ""} to closet
        </Button>
      </div>
    </div>
  );
}
