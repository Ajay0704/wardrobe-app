"use client";

import { Heart, Images, LayoutGrid, Plus, Search, Sparkles, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { forgottenItems } from "@/lib/rediscover";
import { useWardrobe } from "@/lib/store";
import type { Season, WardrobeItem } from "@/lib/types";
import { CATEGORIES, SEASONS } from "@/lib/types";
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
  const [editing, setEditing] = useState<WardrobeItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [seasonalView, setSeasonalView] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [stylingItem, setStylingItem] = useState<WardrobeItem | null>(null);

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  // Least-worn pieces to spotlight for rediscovery.
  const forgotten = useMemo(() => forgottenItems(owned, 6), [owned]);
  const scoped = useMemo(
    () => (favoritesOnly ? owned.filter((it) => it.favorite) : owned),
    [owned, favoritesOnly],
  );
  const filtered = useMemo(() => filterItems(scoped, filters), [scoped, filters]);

  // All tags currently in use, for the tag filter dropdown.
  const allTags = useMemo(
    () => [...new Set(owned.flatMap((it) => it.tags))].sort(),
    [owned],
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className={`${inputClass} !pl-9`}
            placeholder="Search name, brand, color, tags…"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
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
            onClick={() => setFavoritesOnly((v) => !v)}
            title={favoritesOnly ? "Show all items" : "Show favourites only"}
            className={favoritesOnly ? "!border-accent !text-accent" : ""}
          >
            <Heart size={15} className={favoritesOnly ? "fill-current" : ""} />
          </Button>
          <Button
            variant="outline"
            onClick={() => setSeasonalView(!seasonalView)}
            title={seasonalView ? "Grid view" : "Group by season"}
          >
            {seasonalView ? <LayoutGrid size={15} /> : <Sun size={15} />}
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)} title="Import multiple photos">
            <Images size={15} /> Import
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus size={15} /> Add item
          </Button>
        </div>
      </div>

      {/* Rediscover strip — spotlight least-worn pieces to restyle */}
      {owned.length >= 4 && forgotten.length > 0 && (
        <div className="rounded-2xl border border-line bg-accent-soft/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={15} className="text-accent" />
            <h3 className="text-sm font-semibold">Rediscover your closet</h3>
            <span className="text-xs text-muted">
              Pieces you haven&apos;t worn lately — tap for 3 ways to style them.
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {forgotten.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setStylingItem(it)}
                title={`Style ${it.name}`}
                className="group relative h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.imageUrl}
                  alt={it.name}
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white">
                    <Sparkles size={10} /> Style
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        <Chip
          active={filters.category === "all"}
          onClick={() => setFilters({ category: "all" })}
        >
          All ({scoped.length})
        </Chip>
        {CATEGORIES.map((c) => {
          const count = scoped.filter((it) => it.category === c.value).length;
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
          title={
            owned.length === 0
              ? "Your wardrobe is empty"
              : favoritesOnly && scoped.length === 0
                ? "No favourites yet"
                : "No matches"
          }
          subtitle={
            owned.length === 0
              ? "Add your first piece — paste an image link from any store."
              : favoritesOnly && scoped.length === 0
                ? "Tap the heart on any item to add it to your favourites."
                : "Try loosening the search or filters."
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
