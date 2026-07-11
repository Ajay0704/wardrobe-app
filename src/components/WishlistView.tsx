"use client";

import { Heart, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { useWardrobe } from "@/lib/store";
import type { WardrobeItem } from "@/lib/types";
import { ItemCard } from "./ItemCard";
import { ItemForm } from "./ItemForm";
import { useIsNativeApp } from "./NativeAppClass";
import { Button, EmptyState } from "./ui";

export function WishlistView() {
  const { items } = useWardrobe();
  const currency = useWardrobe((s) => s.profile.currency ?? DEFAULT_CURRENCY);
  const isNative = useIsNativeApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WardrobeItem | null>(null);

  const wishlist = useMemo(
    () => items.filter((it) => it.wishlist),
    [items],
  );

  const totalValue = wishlist.reduce((sum, it) => sum + (it.price ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {!isNative && <h2 className="heading text-2xl">Wishlist</h2>}
          <p className={`text-sm text-muted ${isNative ? "" : "mt-1"}`}>
            Pieces you want to buy — track prices and notes before adding to
            your wardrobe.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} /> Add wishlist item
        </Button>
      </div>

      {wishlist.length > 0 && totalValue > 0 && (
        <div className="rounded-2xl border border-line bg-accent-soft/50 px-4 py-3 text-sm">
          <span className="font-medium">Estimated total: </span>
          <span className="text-accent">{formatMoney(totalValue, currency, 0)}</span>
          <span className="text-muted"> across {wishlist.length} items</span>
        </div>
      )}

      {wishlist.length === 0 ? (
        <EmptyState
          title="Your wishlist is empty"
          subtitle="Save items you're eyeing from shop pages with the browser clipper, or add one manually."
          action={
            <Button onClick={() => setAdding(true)}>
              <Heart size={15} /> Add your first wish
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {wishlist.map((item) => (
            <ItemCard key={item.id} item={item} onEdit={setEditing} />
          ))}
        </div>
      )}

      {(adding || editing) && (
        <ItemForm
          initial={editing ?? undefined}
          defaultWishlist
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
