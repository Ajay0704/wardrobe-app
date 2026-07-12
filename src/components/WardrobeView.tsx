"use client";

import { BarChart3, ChevronDown, DoorOpen, Heart, Images, LayoutGrid, MoreVertical, Plus, ScanSearch, SlidersHorizontal, Sparkles, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { forgottenItems } from "@/lib/rediscover";
import { useWardrobe } from "@/lib/store";
import type { Season, WardrobeItem } from "@/lib/types";
import { CATEGORIES, SEASONS } from "@/lib/types";
import { useIsNativeApp } from "./NativeAppClass";
import { ItemCard } from "./ItemCard";
import { ItemForm } from "./ItemForm";
import { RediscoverModal } from "./RediscoverModal";
import { ClosetReviewSheet, ShareClosetSheet } from "./ShareClosetSheet";
import { Button, Chip, EmptyState, inputClass } from "./ui";

const SORT_OPTIONS = [
  ["recent", "Recently added"],
  ["oldest", "Oldest first"],
  ["name", "Name A–Z"],
  ["worn", "Most worn"],
] as const;
type SortKey = (typeof SORT_OPTIONS)[number][0];

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
  const [shareClosetOpen, setShareClosetOpen] = useState(false);
  const [closetReviewOpen, setClosetReviewOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [showFilters, setShowFilters] = useState(false);

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  // Least-worn pieces powering the Restyle quick action.
  const forgotten = useMemo(() => forgottenItems(owned, 6), [owned]);
  const filtered = useMemo(() => filterItems(owned, filters), [owned, filters]);
  const sorted = useMemo(() => {
    const a = [...filtered];
    if (sort === "oldest") a.sort((x, y) => x.createdAt - y.createdAt);
    else if (sort === "name") a.sort((x, y) => x.name.localeCompare(y.name));
    else if (sort === "worn") a.sort((x, y) => (y.wearCount ?? 0) - (x.wearCount ?? 0));
    else a.sort((x, y) => y.createdAt - x.createdAt);
    return a;
  }, [filtered, sort]);

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
    {
      icon: DoorOpen,
      label: "Share Closet",
      onClick: () => setShareClosetOpen(true),
    },
    {
      icon: ScanSearch,
      label: "Closet Review",
      onClick: () => setClosetReviewOpen(true),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Quick actions — app only (the website keeps its toolbar buttons) */}
      {isNative && (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {quickActions.map(({ icon: Icon, label, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex w-14 shrink-0 flex-col items-center gap-1.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-accent">
                <Icon size={19} />
              </span>
              <span className="w-full text-center text-[10px] leading-tight text-muted">
                {label}
              </span>
            </button>
          ))}
        </div>
      )}

      {isNative ? (
        <>
          {/* All Clothes header */}
          <div className="-mt-2 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xl font-semibold">
              All Clothes
              <ChevronDown size={18} className="text-muted" />
            </span>
            <button
              type="button"
              aria-label={seasonalView ? "Grid view" : "Group by season"}
              onClick={() => setSeasonalView((v) => !v)}
              className="text-muted"
            >
              <MoreVertical size={20} />
            </button>
          </div>

          {/* Filter + sort */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Filters"
              onClick={() => setShowFilters((v) => !v)}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                showFilters ? "border-accent text-accent" : "border-line text-foreground"
              }`}
            >
              <SlidersHorizontal size={17} />
            </button>
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-11 appearance-none rounded-xl border border-line bg-surface pl-4 pr-10 text-sm font-medium"
              >
                {SORT_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              />
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2">
              <select
                className={`${inputClass} !w-auto`}
                value={filters.season}
                onChange={(e) => setFilters({ season: e.target.value as Season | "all" })}
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
            </div>
          )}

          {/* Category text tabs */}
          <div className="-mx-4 flex gap-6 overflow-x-auto border-b border-line px-4">
            <TextTab
              label="All"
              active={filters.category === "all"}
              onClick={() => setFilters({ category: "all" })}
            />
            {CATEGORIES.map((c) => {
              const count = owned.filter((it) => it.category === c.value).length;
              if (count === 0) return null;
              return (
                <TextTab
                  key={c.value}
                  label={c.label}
                  active={filters.category === c.value}
                  onClick={() => setFilters({ category: c.value })}
                />
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Toolbar (web) */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={`${inputClass} !w-auto`}
              value={filters.season}
              onChange={(e) => setFilters({ season: e.target.value as Season | "all" })}
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
            <Button variant="outline" onClick={() => setBulkOpen(true)} title="Import multiple photos">
              <Images size={15} /> Import
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus size={15} /> Add item
            </Button>
          </div>

          {/* Category chips (web) */}
          <div className="flex flex-wrap gap-1.5">
            <Chip active={filters.category === "all"} onClick={() => setFilters({ category: "all" })}>
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
        </>
      )}

      {/* Grid */}
      {sorted.length === 0 ? (
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
            const group = sorted.filter((it) => it.seasons.includes(season));
            if (group.length === 0) return null;
            return (
              <section key={season}>
                <h3 className="heading mb-3 text-lg capitalize">
                  {season}{" "}
                  <span className="text-sm text-muted">({group.length})</span>
                </h3>
                {isNative ? (
                  <ClosetGrid items={group} onEdit={setEditing} />
                ) : (
                  <Grid items={group} onEdit={setEditing} />
                )}
              </section>
            );
          })}
        </div>
      ) : isNative ? (
        <ClosetGrid items={sorted} onEdit={setEditing} />
      ) : (
        <Grid items={sorted} onEdit={setEditing} />
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

      {shareClosetOpen && (
        <ShareClosetSheet onClose={() => setShareClosetOpen(false)} />
      )}
      {closetReviewOpen && (
        <ClosetReviewSheet onClose={() => setClosetReviewOpen(false)} />
      )}
    </div>
  );
}

function TextTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 border-b-2 pb-2.5 text-sm transition-colors ${
        active
          ? "border-foreground font-semibold text-foreground"
          : "border-transparent text-muted"
      }`}
    >
      {label}
    </button>
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

/** Acloset-style closet grid: edge-to-edge 3-col with hairline dividers, showing
 *  the item photo, brand, and date added. Used in the native app. */
function ClosetGrid({
  items,
  onEdit,
}: {
  items: WardrobeItem[];
  onEdit: (item: WardrobeItem) => void;
}) {
  return (
    <div className="-mx-4 grid grid-cols-3 border-t border-line">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onEdit(item)}
          className={`border-b border-line text-left ${i % 3 !== 2 ? "border-r" : ""}`}
        >
          <div className="aspect-[3/4] overflow-hidden bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] text-muted">
              {item.brand?.trim() || "No Brand"}
            </p>
            <p className="text-[11px] text-muted/70">
              {new Date(item.createdAt).toLocaleDateString("en-US")}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
