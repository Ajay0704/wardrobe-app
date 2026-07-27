"use client";

import { Plus, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useWardrobe } from "@/lib/store";
import { isSampleItem } from "@/lib/demo-data";
import { shareItem } from "@/lib/share";
import type { WardrobeItem } from "@/lib/types";
import { matchesSubcategory, presentSubcategories } from "@/lib/types";
import { useIsNativeApp } from "./NativeAppClass";
import { ClosetsSheet } from "./ClosetSheets";
import { ItemCard } from "./ItemCard";
import { ItemForm } from "./ItemForm";
import { SharedClosetView } from "./SharedClosetView";
import { Button, Chip, EmptyState } from "./ui";

// Top-level closet tabs. Outfits lives on its own page/tab, so it's intentionally not here.
const TABS = [
  { key: "items", label: "Items" },
  { key: "wishlist", label: "Wishlist" },
  { key: "shared", label: "Shared" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// One top-level tab per category (AJA-228); the chip row below drills into sub-categories.
const MAIN_TABS = [
  { key: "all", label: "All", cat: null },
  { key: "top", label: "Tops", cat: "top" },
  { key: "bottom", label: "Bottoms", cat: "bottom" },
  { key: "dress", label: "Dresses", cat: "dress" },
  { key: "outerwear", label: "Outerwear", cat: "outerwear" },
  { key: "shoes", label: "Shoes", cat: "shoes" },
  { key: "bag", label: "Bags", cat: "bag" },
  { key: "accessory", label: "Accessories", cat: "accessory" },
] as const;
type MainTabKey = (typeof MAIN_TABS)[number]["key"];

export function WardrobeView() {
  const items = useWardrobe((s) => s.items);
  const closetsOpen = useWardrobe((s) => s.closetsOpen);
  const setClosetsOpen = useWardrobe((s) => s.setClosetsOpen);
  const openScan = useWardrobe((s) => s.openScan);
  const setAddSheetOpen = useWardrobe((s) => s.setAddSheetOpen);
  const isNative = useIsNativeApp();

  const [tab, setTab] = useState<TabKey>("items");
  const [mainTab, setMainTab] = useState<MainTabKey>("all");
  const [subCat, setSubCat] = useState<string>("all");
  const [editing, setEditing] = useState<WardrobeItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [addWishlist, setAddWishlist] = useState(false);

  // A shared link's "Open in Wardrobe" deep link queues an item id in the store.
  // Consume it from a store subscription (not a synchronous effect body) and open
  // that item's editor, switching to the tab that holds it.
  useEffect(() => {
    const open = (id: string | null) => {
      if (!id) return;
      const s = useWardrobe.getState();
      const target = s.items.find((it) => it.id === id);
      s.setPendingOpenItemId(null);
      if (target) {
        setTab(target.wishlist ? "wishlist" : "items");
        setEditing(target);
      }
    };
    const openTab = (t: "shared") => {
      useWardrobe.getState().setPendingWardrobeTab(null);
      setEditing(null);
      setAdding(false);
      setTab(t);
    };
    const unsub = useWardrobe.subscribe((s, prev) => {
      if (s.pendingOpenItemId && s.pendingOpenItemId !== prev.pendingOpenItemId) {
        open(s.pendingOpenItemId);
      }
      // Native dock tapped — close the open editor so the tab navigates instead
      // of leaving the portaled editor stuck on top (AJA-206).
      if (s.editorCloseNonce !== prev.editorCloseNonce) {
        setEditing(null);
        setAdding(false);
      }
      // A shared-closet invite notification was tapped — open the Shared tab.
      if (s.pendingWardrobeTab && s.pendingWardrobeTab !== prev.pendingWardrobeTab) {
        openTab(s.pendingWardrobeTab);
      }
    });
    // Catch deep links that set state before this subscribed (cold start).
    queueMicrotask(() => {
      open(useWardrobe.getState().pendingOpenItemId);
      const pt = useWardrobe.getState().pendingWardrobeTab;
      if (pt) openTab(pt);
    });
    return unsub;
  }, []);

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  const wish = useMemo(() => items.filter((it) => it.wishlist), [items]);
  const base = tab === "wishlist" ? wish : owned;

  // Category tab + sub-category chip filter (recent-first). "Others" collects items with no
  // (or unknown) sub-category. No search/sort/season filter in the redesigned closet.
  const shown = useMemo(() => {
    const g = MAIN_TABS.find((t) => t.key === mainTab);
    let arr = [...base].sort((x, y) => y.createdAt - x.createdAt);
    if (g?.cat) arr = arr.filter((it) => it.category === g.cat);
    if (subCat !== "all") arr = arr.filter((it) => matchesSubcategory(it, subCat));
    return arr;
  }, [base, mainTab, subCat]);

  // Sub-category chips present in the active category, ordered per the taxonomy, + "Others".
  const subChips = useMemo(() => {
    const g = MAIN_TABS.find((t) => t.key === mainTab);
    return g?.cat ? presentSubcategories(g.cat, base) : [];
  }, [mainTab, base]);

  const openAdd = () => {
    // Closet "+" now opens the SAME add sheet as the tab-bar "+" on native (Take photos /
    // Photo library / Paste a link → the background multi-photo import), so both add buttons
    // behave identically and multi-select works from here too (AJA-236 follow-up). Web goes
    // straight to the multi-photo library import. Wishlist adds stay single-item.
    if (tab === "wishlist") {
      setAddWishlist(true);
      setAdding(true);
    } else if (isNative) {
      setAddSheetOpen(true);
    } else {
      openScan();
    }
  };

  const switchTab = (t: TabKey) => {
    setTab(t);
    setMainTab("all");
    setSubCat("all");
  };

  return (
    <div className="space-y-4">
      {/* Top: Items / Wishlist / Shared + add */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-xl bg-surface-2 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm transition-colors ${
                tab === t.key
                  ? "border border-line bg-surface font-medium text-foreground"
                  : "border border-transparent text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "shared" && (
          <button
            type="button"
            onClick={openAdd}
            aria-label={tab === "wishlist" ? "Add wishlist item" : "Add item"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-foreground transition-colors hover:border-accent/60"
          >
            <Plus size={20} />
          </button>
        )}
      </div>

      {tab === "shared" ? (
        <SharedClosetView />
      ) : (
        <>
          {/* Category tabs */}
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

          {subChips.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
              <Chip active={subCat === "all"} onClick={() => setSubCat("all")}>
                All
              </Chip>
              {subChips.map((c) => (
                <Chip key={c.value} active={subCat === c.value} onClick={() => setSubCat(c.value)}>
                  {c.label}
                </Chip>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <EmptyState
              title={
                base.length === 0
                  ? tab === "wishlist"
                    ? "No wishlist items yet"
                    : "Your wardrobe is empty"
                  : "No matches"
              }
              subtitle={
                base.length === 0
                  ? tab === "wishlist"
                    ? "Save pieces you want to buy."
                    : "Add your first piece — take a photo or paste a link."
                  : "Nothing in this category."
              }
              action={
                base.length === 0 && (
                  <Button onClick={openAdd}>
                    <Plus size={15} />{" "}
                    {tab === "wishlist" ? "Add wishlist item" : "Add item"}
                  </Button>
                )
              }
            />
          ) : isNative ? (
            <ClosetGrid items={shown} onEdit={setEditing} />
          ) : (
            <Grid items={shown} onEdit={setEditing} />
          )}
        </>
      )}

      {(adding || editing) && (
        <ItemForm
          initial={editing ?? undefined}
          defaultWishlist={adding ? addWishlist : undefined}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      <ClosetsSheet open={closetsOpen} items={items} onClose={() => setClosetsOpen(false)} />
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

/** Edge-to-edge 3-col grid with hairline dividers — the item photo (with a
    share button overlaid top-right) and a centered brand below. */
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
        // A div (not a button) so the share control can be a real nested button.
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => onEdit(item)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onEdit(item);
            }
          }}
          className={`cursor-pointer border-b border-line text-left ${i % 3 !== 2 ? "border-r" : ""}`}
        >
          <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              loading="lazy"
              className="h-full w-full object-contain"
            />
            {isSampleItem(item) && !item.wishlist && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-accent/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-foreground backdrop-blur">
                Sample
              </span>
            )}
          </div>
          {/* Brand + Share in the footer (off the photo — AJA-211) so the share
              control never covers the garment. */}
          <div className="flex items-center gap-1 py-1 pl-2.5 pr-1">
            {/* Falls back to "No Brand" so tiles never show an empty gap. */}
            <p className="min-w-0 flex-1 truncate text-left text-[12.5px] text-muted">
              {item.brand?.trim() || "No Brand"}
            </p>
            <button
              type="button"
              aria-label={`Share ${item.name}`}
              title="Share"
              onClick={(e) => {
                e.stopPropagation();
                void shareItem(item);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Share2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
