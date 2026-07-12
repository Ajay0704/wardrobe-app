"use client";

import { BarChart3, ChevronDown, DoorOpen, Heart, Images, LayoutGrid, MoreVertical, Plus, ScanSearch, SlidersHorizontal, Sparkles, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { forgottenItems } from "@/lib/rediscover";
import { useWardrobe } from "@/lib/store";
import type { Season, WardrobeItem } from "@/lib/types";
import { CATEGORIES, SEASONS } from "@/lib/types";
import { useIsNativeApp } from "./NativeAppClass";
import { ClosetsSheet, FilterSheet, SortSheet } from "./ClosetSheets";
import { ItemCard } from "./ItemCard";
import { ItemForm } from "./ItemForm";
import { RediscoverModal } from "./RediscoverModal";
import { ClosetReviewSheet, ShareClosetSheet } from "./ShareClosetSheet";
import { Button, Chip, EmptyState, inputClass } from "./ui";
import { CATEGORY_LABEL, type Category } from "@/lib/types";

const SORT_OPTIONS = [
  { key: "recent", label: "Recently added" },
  { key: "worn", label: "Most worn" },
  { key: "leastworn", label: "Least worn" },
  { key: "recentlyworn", label: "Recently worn" },
  { key: "category", label: "By category" },
  { key: "name", label: "Name A–Z" },
  { key: "priceHigh", label: "Price: High to Low" },
  { key: "priceLow", label: "Price: Low to High" },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]["key"];

// Main tabs map to our category enum (sub-tabs = categories within the group).
const MAIN_TABS = [
  { key: "all", label: "All", cats: null },
  { key: "tops", label: "Tops", cats: ["top", "outerwear", "dress"] },
  { key: "pants", label: "Pants", cats: ["bottom"] },
  { key: "shoes", label: "Shoes", cats: ["shoes", "bag", "accessory"] },
] as const;
type MainTabKey = (typeof MAIN_TABS)[number]["key"];

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
  const closetsOpen = useWardrobe((s) => s.closetsOpen);
  const setClosetsOpen = useWardrobe((s) => s.setClosetsOpen);
  const isNative = useIsNativeApp();
  const [editing, setEditing] = useState<WardrobeItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [seasonalView, setSeasonalView] = useState(false);
  const [stylingItem, setStylingItem] = useState<WardrobeItem | null>(null);
  const [shareClosetOpen, setShareClosetOpen] = useState(false);
  const [closetReviewOpen, setClosetReviewOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [mainTab, setMainTab] = useState<MainTabKey>("all");
  const [subCat, setSubCat] = useState<Category | "all">("all");
  const [sheet, setSheet] = useState<null | "closets" | "filter" | "sort">(null);

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  // Least-worn pieces powering the Restyle quick action.
  const forgotten = useMemo(() => forgottenItems(owned, 6), [owned]);
  const filtered = useMemo(() => filterItems(owned, filters), [owned, filters]);
  const sorted = useMemo(() => {
    const a = [...filtered];
    switch (sort) {
      case "worn": a.sort((x, y) => (y.wearCount ?? 0) - (x.wearCount ?? 0)); break;
      case "leastworn": a.sort((x, y) => (x.wearCount ?? 0) - (y.wearCount ?? 0)); break;
      case "recentlyworn": a.sort((x, y) => (y.lastWornAt ?? "").localeCompare(x.lastWornAt ?? "")); break;
      case "category": a.sort((x, y) => x.category.localeCompare(y.category)); break;
      case "name": a.sort((x, y) => x.name.localeCompare(y.name)); break;
      case "priceHigh": a.sort((x, y) => (y.price ?? 0) - (x.price ?? 0)); break;
      case "priceLow": a.sort((x, y) => (x.price ?? 0) - (y.price ?? 0)); break;
      default: a.sort((x, y) => y.createdAt - x.createdAt);
    }
    return a;
  }, [filtered, sort]);
  // Two-level category filter (native): main-tab group + optional sub-category.
  const shown = useMemo(() => {
    const g = MAIN_TABS.find((t) => t.key === mainTab);
    let arr = sorted;
    if (g?.cats) arr = arr.filter((it) => (g.cats as readonly string[]).includes(it.category));
    if (subCat !== "all") arr = arr.filter((it) => it.category === subCat);
    return arr;
  }, [sorted, mainTab, subCat]);
  const subCats = useMemo(() => {
    const g = MAIN_TABS.find((t) => t.key === mainTab);
    if (!g?.cats) return [];
    return g.cats.filter((c) => owned.some((it) => it.category === c));
  }, [mainTab, owned]);
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "Sort";

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
              {label === "Import" ? (
                <BrandCluster />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-accent">
                  <Icon size={19} />
                </span>
              )}
              <span className="w-full text-center text-[10px] leading-tight text-muted">
                {label}
              </span>
            </button>
          ))}
        </div>
      )}

      {isNative ? (
        <>
          {/* All Clothes header — opens the closets sheet */}
          <div className="-mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSheet("closets")}
              className="flex items-center gap-1 text-xl font-semibold"
            >
              All Clothes
              <ChevronDown size={18} className="text-muted" />
            </button>
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
              onClick={() => setSheet("filter")}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                filters.season !== "all" || filters.tag !== "all"
                  ? "border-accent text-accent"
                  : "border-line text-foreground"
              }`}
            >
              <SlidersHorizontal size={17} />
            </button>
            <button
              type="button"
              onClick={() => setSheet("sort")}
              className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium"
            >
              {sortLabel}
              <ChevronDown size={16} className="text-muted" />
            </button>
          </div>

          {/* Main category tabs */}
          <div className="-mx-4 flex gap-6 overflow-x-auto border-b border-line px-4">
            {MAIN_TABS.map((t) => (
              <TextTab
                key={t.key}
                label={t.label}
                active={mainTab === t.key}
                onClick={() => {
                  setMainTab(t.key);
                  setSubCat("all");
                }}
              />
            ))}
          </div>

          {/* Sub-category chips (when a main tab has more than one type) */}
          {subCats.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
              <Chip active={subCat === "all"} onClick={() => setSubCat("all")}>
                All
              </Chip>
              {subCats.map((c) => (
                <Chip key={c} active={subCat === c} onClick={() => setSubCat(c)}>
                  {CATEGORY_LABEL[c]}
                </Chip>
              ))}
            </div>
          )}
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
      {(isNative ? shown : sorted).length === 0 ? (
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
            const group = (isNative ? shown : sorted).filter((it) =>
              it.seasons.includes(season),
            );
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
        <ClosetGrid items={shown} onEdit={setEditing} />
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

      {(sheet === "closets" || closetsOpen) && (
        <ClosetsSheet
          items={items}
          onClose={() => {
            setSheet(null);
            setClosetsOpen(false);
          }}
        />
      )}
      {sheet === "sort" && (
        <SortSheet
          value={sort}
          options={SORT_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
          onSelect={setSort}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "filter" && (
        <FilterSheet
          season={filters.season}
          tag={filters.tag}
          allTags={allTags}
          onChange={(patch) => setFilters(patch)}
          onClear={() => setFilters({ season: "all", tag: "all" })}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/** Brand-logo cluster for the Import quick action (Gmail + shops). */
function BrandCluster() {
  const cell =
    "flex h-6 w-6 items-center justify-center rounded-md text-[8px] font-bold text-white";
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
      <span className="grid grid-cols-2 grid-rows-2 gap-0.5">
        <span className={cell} style={{ background: "#ea4335" }}>@</span>
        <span className={cell} style={{ background: "#111111" }}>Z</span>
        <span className={cell} style={{ background: "#e50010" }}>H</span>
        <span className={cell} style={{ background: "#e4002b" }}>U</span>
      </span>
    </span>
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
