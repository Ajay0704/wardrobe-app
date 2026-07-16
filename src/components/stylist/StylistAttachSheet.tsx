"use client";

import { Search, Shirt, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useWardrobe } from "@/lib/store";
import { CATEGORY_LABEL, type WardrobeItem } from "@/lib/types";

/** Bottom sheet to attach one of your pieces to a Stylist question
 *  ("how do I wear this?", "should I buy this?", compare). */
export function StylistAttachSheet({
  onPick,
  onClose,
  excludeIds = [],
}: {
  onPick: (item: WardrobeItem) => void;
  onClose: () => void;
  excludeIds?: string[];
}) {
  const items = useWardrobe((s) => s.items);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items
      .filter((it) => !excludeIds.includes(it.id))
      .filter((it) =>
        query
          ? [it.name, it.colorName, it.brand, CATEGORY_LABEL[it.category]]
              .filter(Boolean)
              .some((s) => (s as string).toLowerCase().includes(query))
          : true,
      );
  }, [items, q, excludeIds]);

  return (
    <div className="fixed inset-0 z-[75] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[80vh] rounded-t-3xl bg-background pb-[max(16px,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <p className="font-semibold">Attach a piece</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2">
            <Search size={16} className="text-muted" />
            <input
              className="flex-1 bg-transparent text-sm outline-none"
              placeholder="Search your closet…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {list.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Nothing to attach yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 pb-2">
              {list.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onPick(it)}
                  className="overflow-hidden rounded-xl border border-line bg-surface text-left hover:border-accent"
                >
                  <div className="aspect-square bg-surface-2">
                    <ItemImg item={it} />
                  </div>
                  <p className="truncate px-2 py-1.5 text-[11px] font-medium">{it.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemImg({ item }: { item: WardrobeItem }) {
  const [err, setErr] = useState(false);
  const src = item.beautifiedImageUrl || item.imageUrl;
  if (!src || err) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Shirt size={22} className="text-muted" strokeWidth={1.5} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={item.name} onError={() => setErr(true)} className="h-full w-full object-cover" />;
}
