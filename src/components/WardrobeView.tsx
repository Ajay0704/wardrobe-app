"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useWardrobe } from "@/lib/store";
import type { Category, WardrobeItem } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { useIsNativeApp } from "./NativeAppClass";
import { ClosetsSheet } from "./ClosetSheets";
import { ItemCard } from "./ItemCard";
import { ItemForm } from "./ItemForm";
import { Button, Chip, EmptyState } from "./ui";

// Top-level closet tabs. Outfits lives on its own page/tab, so it's intentionally not here.
const TABS = [
  { key: "items", label: "Items" },
  { key: "wishlist", label: "Wishlist" },
  { key: "shared", label: "Shared" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Category tabs map to our category enum (sub-tabs = categories within the group).
const MAIN_TABS = [
  { key: "all", label: "All", cats: null },
  { key: "tops", label: "Tops", cats: ["top", "outerwear", "dress"] },
  { key: "pants", label: "Pants", cats: ["bottom"] },
  { key: "shoes", label: "Shoes", cats: ["shoes", "bag", "accessory"] },
] as const;
type MainTabKey = (typeof MAIN_TABS)[number]["key"];

export function WardrobeView() {
  const items = useWardrobe((s) => s.items);
  const closetsOpen = useWardrobe((s) => s.closetsOpen);
  const setClosetsOpen = useWardrobe((s) => s.setClosetsOpen);
  const openSplit = useWardrobe((s) => s.openSplit);
  const isNative = useIsNativeApp();

  const [tab, setTab] = useState<TabKey>("items");
  const [mainTab, setMainTab] = useState<MainTabKey>("all");
  const [subCat, setSubCat] = useState<Category | "all">("all");
  const [editing, setEditing] = useState<WardrobeItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [addWishlist, setAddWishlist] = useState(false);

  const owned = useMemo(() => items.filter((it) => !it.wishlist), [items]);
  const wish = useMemo(() => items.filter((it) => it.wishlist), [items]);
  const base = tab === "wishlist" ? wish : owned;

  // Category-tab filter (recent-first); no search/sort/season filter in the redesigned closet.
  const shown = useMemo(() => {
    const g = MAIN_TABS.find((t) => t.key === mainTab);
    let arr = [...base].sort((x, y) => y.createdAt - x.createdAt);
    if (g?.cats) arr = arr.filter((it) => (g.cats as readonly string[]).includes(it.category));
    if (subCat !== "all") arr = arr.filter((it) => it.category === subCat);
    return arr;
  }, [base, mainTab, subCat]);

  const subCats = useMemo(() => {
    const g = MAIN_TABS.find((t) => t.key === mainTab);
    if (!g?.cats) return [];
    return g.cats.filter((c) => base.some((it) => it.category === c));
  }, [mainTab, base]);

  const openAdd = () => {
    // Closet "+" opens the whole-outfit detector (photo → every garment). Wishlist
    // adds stay single-item since you're saving one thing you want to buy.
    if (tab === "wishlist") {
      setAddWishlist(true);
      setAdding(true);
    } else {
      openSplit();
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
        <EmptyState
          title="Shared wardrobe"
          subtitle="Coming soon — you'll be able to share your closet and see closets shared with you here."
        />
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

      {closetsOpen && (
        <ClosetsSheet items={items} onClose={() => setClosetsOpen(false)} />
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

/** Edge-to-edge 3-col grid with hairline dividers — the item photo, brand, and date. */
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
          <div className="flex aspect-square items-center justify-center overflow-hidden bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              loading="lazy"
              className="h-full w-full object-contain"
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
