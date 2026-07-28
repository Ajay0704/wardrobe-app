"use client";

import { Heart, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import type { DecisionOutcome } from "@/lib/decisions";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import {
  filterWishlist,
  planTotals,
  presentWishChips,
  wishVerdict,
  type WishFilter,
  type WishVerdict,
} from "@/lib/wishlist-plan";
import { ItemCard } from "./ItemCard";
import { ItemForm } from "./ItemForm";
import { useIsNativeApp } from "./NativeAppClass";
import { Button, EmptyState } from "./ui";
import { PlanHeader } from "./wishlist/PlanHeader";
import { ShouldIBuySheet } from "./wishlist/ShouldIBuySheet";

/**
 * The wishlist (AJA-242). It used to be a grid plus an "Estimated total" banner —
 * storage with no opinion. Now it's measured against a shopping plan and every card
 * carries a verdict, so the screen answers "should I buy this?" instead of just
 * remembering that you might.
 */
export function WishlistView() {
  const items = useWardrobe((s) => s.items);
  const setWishlistAddOpen = useWardrobe((s) => s.setWishlistAddOpen);
  const plan = useWardrobe((s) => s.profile.shoppingPlan);
  const styleVibes = useWardrobe((s) => s.profile.styleVibes);
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const isNative = useIsNativeApp();

  const [editing, setEditing] = useState<WardrobeItem | null>(null);
  const [filter, setFilter] = useState<WishFilter>("all");
  const [deciding, setDeciding] = useState<WardrobeItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // The sheet has already committed the change; this only closes it and says what
  // happened, because a piece leaving the grid is otherwise silent.
  const onDecided = (item: WardrobeItem, decision: DecisionOutcome) => {
    setDeciding(null);
    if (decision === "bought") setToast(`${item.name} moved into your closet`);
    else if (decision === "skipped") {
      setToast(
        item.price !== undefined
          ? `Skipped — ${formatMoney(item.price, currency, 0)} back in the plan`
          : "Skipped",
      );
    } else setToast("Kept on your list");
  };

  const wishlist = useMemo(() => items.filter((it) => it.wishlist), [items]);

  // One pass over the wishlist against the owned closet. Keyed on `items` so it only
  // recomputes when the closet actually changes, not on every filter tap.
  const verdicts = useMemo(() => {
    const m = new Map<string, WishVerdict>();
    for (const it of wishlist) m.set(it.id, wishVerdict(it, items, styleVibes));
    return m;
  }, [wishlist, items, styleVibes]);

  const totals = useMemo(
    () => planTotals(wishlist, plan?.budget ?? 0),
    [wishlist, plan?.budget],
  );

  const chips = useMemo(
    () => presentWishChips(wishlist, verdicts, totals.remaining),
    [wishlist, verdicts, totals.remaining],
  );

  const visible = useMemo(() => {
    // A chip can disappear as the list changes (e.g. the last duplicate is bought),
    // so fall back rather than showing an empty grid under a filter that's gone.
    const active = chips.some((c) => c.key === filter) ? filter : "all";
    return filterWishlist(active, wishlist, verdicts, totals.remaining);
  }, [chips, filter, wishlist, verdicts, totals.remaining]);

  return (
    <div className={isNative ? "space-y-0" : "space-y-6"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {!isNative && <h2 className="heading text-2xl">Wishlist</h2>}
          <p className={`text-sm text-muted ${isNative ? "mb-3" : "mt-1"}`}>
            Pieces you&apos;re considering — see what they go with before you buy.
          </p>
        </div>
        {!isNative && (
          <Button onClick={() => setWishlistAddOpen(true)}>
            <Plus size={15} /> Add wishlist item
          </Button>
        )}
      </div>

      {wishlist.length > 0 && (
        <PlanHeader wishlist={wishlist} verdicts={verdicts} totals={totals} />
      )}

      {chips.length > 0 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => {
            const on = c.key === (chips.some((x) => x.key === filter) ? filter : "all");
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(c.key)}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors active:scale-95 ${
                  on
                    ? "border-accent bg-accent font-medium text-accent-foreground"
                    : "border-line bg-surface text-foreground"
                }`}
              >
                {c.label}
                <span className="text-xs opacity-60">{c.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {wishlist.length === 0 ? (
        <EmptyState
          title="Your wishlist is empty"
          subtitle="Save something you're eyeing — from Shop, a photo, or a link — and we'll show you what it goes with."
          action={
            <Button onClick={() => setWishlistAddOpen(true)}>
              <Heart size={15} /> Add your first wish
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nothing matches that.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onEdit={setEditing}
              verdict={verdicts.get(item.id)}
              onDecide={setDeciding}
            />
          ))}
        </div>
      )}

      <ShouldIBuySheet
        item={deciding}
        onDecided={onDecided}
        onClose={() => setDeciding(null)}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-50 max-w-sm -translate-x-1/2 animate-fade-up rounded-full border border-line bg-surface px-4 py-2 text-center text-sm shadow-lg sm:bottom-8"
        >
          {toast}
        </div>
      )}

      {editing && (
        <ItemForm
          initial={editing}
          defaultWishlist
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
