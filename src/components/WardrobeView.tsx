"use client";

import { BarChart3, Heart, Images, LayoutGrid, Plus, Sparkles, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { forgottenItems } from "@/lib/rediscover";
import { useWardrobe } from "@/lib/store";
import type { Season, WardrobeItem } from "@/lib/types";
import { CATEGORIES, SEASONS } from "@/lib/types";
import { useIsNativeApp } from "./NativeAppClass";
import { ItemCard } from "./ItemCard";
import { ItemForm } from "./ItemForm";
import { RediscoverModal } from "./RediscoverModal";
import { Button, Chip, EmptyState, inputClass } from "./ui";

/** Apply search + category/season/tag filters to the item list. */
export function filterItems(
  items: WardrobeItem[],
  filters: ReturnType<typeof useWardrobe.getState>["filters"],
): WardrobeItem[] {
  const q = filters.search.trim().toLowerCase();
  return items.filter((it) => {
    if (filters.category !== "all" && it.category !== filters.category)
      return false;
    if (filters.season !== "all" && !it.seasons.includes(filters.season))
      return false;
    if (filters.tag !== "all" && !it.tags.includes(filters.tag)) return false;
    if (q) {
      const haystack = [
        it.name,
        it.brand ?? "",
        it.colorName ?? "",
        it.notes ?? "",
        ...it.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function WardrobeView() {
  const { items, filters, setFilters } = useWardrobe();
  const setBulkOpen = useWardrobe((s) => s.setBulkOpen);
  const setView = useWardrobe((s) => s.setView);
  const isNative = useIsNativeApp();
  const [editing, setEditing] = useState<WardrobeItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [seasonalView, setSeasonalView] = useState(false);
  const [stylingItem, setStylingItem] = useState<WardrobeItem | null>(null);

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  // Least-worn pieces powering the Restyle quick action.
  const forgotten = useMemo(() => forgottenItems(owned, 6), [owned]);
  const filtered = useMemo(() => filterItems(owned, filters), [owned, filters]);

  // All tags currently in use, for the tag filter dropdown.
  const allTags = useMemo(
    () => [...new Set(owned.flatMap((it) => it.tags))].sort(),
    [owned],
  );

  const quickActions = [
    { icon: Images, label: "Import", onClick: () => setBulkOpen(true) },
    {
      icon: Sparkles,
      label: "Restyle",
      onClick: () => forgotten[0] && setStylingItem(forgotten[0]),
    },
    { icon: BarChart3, label: "Insights", onClick: () => setView("insights") },
    { icon: Heart, label: "Wishlist", onClick: () => setView("wishlist") },
  ];

  return (
    <div className="space-y-6">
      {/* Quick actions — app only (the website keeps its toolbar buttons) */}
      {isNative && (
        <div className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-1">
          {quickActions.map(({ icon: Icon, label, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex shrink-0 flex-col items-center gap-1.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-accent">
                <Icon size={19} />
              </span>
              <span className="text-[11px] text-muted">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${inputClass} !w-auto`}
            value={filters.season}
            onChange={(e) =>
              setFilters({ season: e.target.value as Season | "all" })
            }
          >
            <option value="all">All seasons</option>
            {SEASONS.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select
            className={`${inputClass} !w-auto`}
            value={filters.tag}
            onChange={(e) => setFilters({ tag: e.target.value })}
          >
            <option value="all">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => setSeasonalView(!seasonalView)}
            title={seasonalView ? "Grid view" : "Group by season"}
          >
            {seasonalView ? <LayoutGrid size={15} /> : <Sun size={15} />}
          </Button>
          {/* On native these live in the quick-action row + ＋ FAB, so hide them here. */}
          {!isNative && (
            <>
              <Button variant="outline" onClick={() => setBulkOpen(true)} title="Import multiple photos">
                <Images size={15} /> Import
              </Button>
              <Button onClick={() => setAdding(true)}>
                <Plus size={15} /> Add item
              </Button>
            </>
          )}
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        <Chip
          active={filters.category === "all"}
          onClick={() => setFilters({ category: "all" })}
        >
          All ({owned.length})
        </Chip>
        {CATEGORIES.map((c) => {
          const count = owned.filter((it) => it.category === c.value).length;
          if (count === 0) return null;
          return (
            <Chip
              key={c.value}
              active={filters.category === c.value}
              onClick={() => setFilters({ category: c.value })}
            >
              {c.label} ({count})
            </Chip>
          );
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title={owned.length === 0 ? "Your wardrobe is empty" : "No matches"}
          subtitle={
            owned.length === 0
              ? "Add your first piece — paste an image link from any store."
              : "Try loosening the filters."
          }
          action={
            owned.length === 0 && (
              <Button onClick={() => setAdding(true)}>
                <Plus size={15} /> Add your first item
              </Button>
            )
          }
        />
      ) : seasonalView ? (
        <div className="space-y-8">
          {SEASONS.map((season) => {
            const group = filtered.filter((it) => it.seasons.includes(season));
            if (group.length === 0) return null;
            return (
              <section key={season}>
                <h3 className="heading mb-3 text-lg capitalize">
                  {season}{" "}
                  <span className="text-sm text-muted">({group.length})</span>
                </h3>
                <Grid items={group} onEdit={setEditing} />
              </section>
            );
          })}
        </div>
      ) : (
        <Grid items={filtered} onEdit={setEditing} />
      )}

      {(adding || editing) && (
        <ItemForm
          initial={editing ?? undefined}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {stylingItem && (
        <RediscoverModal
          anchor={stylingItem}
          onClose={() => setStylingItem(null)}
        />
      )}
    </div>
  );
}

function Grid({
  items,
  onEdit,
}: {
  items: WardrobeItem[];
  onEdit: (item: WardrobeItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onEdit={onEdit} />
      ))}
    </div>
  );
}
