"use client";

import { Rnd } from "react-rnd";
import {
  ChevronDown,
  ChevronRight,
  FlipHorizontal,
  Image as ImageIcon,
  LayoutGrid,
  Maximize2,
  SlidersHorizontal,
  Sticker,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useWardrobe } from "@/lib/store";
import type { Category, WardrobeItem } from "@/lib/types";

/* Category tabs → which item categories each shows. */
const TABS: { key: string; label: string; cats: Category[] | null }[] = [
  { key: "all", label: "All", cats: null },
  { key: "tops", label: "Tops", cats: ["top", "outerwear", "dress"] },
  { key: "pants", label: "Pants", cats: ["bottom"] },
  { key: "shoes", label: "Shoes", cats: ["shoes"] },
];

const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-US");

/**
 * Acloset-style outfit maker. Full-screen over the shell: a white board where
 * cutout pieces are dragged / resized / flipped / layered, an on-board editor
 * toolbar, and a "Select item" sheet to drop pieces in. Builds on the shared
 * canvasDraft store; text / sticker / photo tools are stubbed for v1.
 */
export function CanvasBuilderView() {
  const {
    items,
    canvasDraft,
    addCanvasItem,
    updateCanvasItem,
    removeCanvasItem,
    clearDraft,
    saveOutfit,
    setView,
  } = useWardrobe();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("all");
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1800);
  };
  const soon = (what: string) => flash(`${what} — coming soon`);

  const pieces = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    return items.filter(
      (it) =>
        !it.wishlist &&
        it.imageUrl &&
        (t.cats === null || t.cats.includes(it.category)),
    );
  }, [items, tab]);

  const bringToFront = (id: string) => {
    const top = canvasDraft.reduce((m, c) => Math.max(m, c.zIndex), 0);
    updateCanvasItem(id, { zIndex: top + 1 });
  };
  const select = (id: string) => {
    setSelectedId(id);
    bringToFront(id);
  };

  const addPiece = (itemId: string) => {
    addCanvasItem(itemId);
    // The store assigns the id; grab the freshly appended item to select it.
    window.setTimeout(() => {
      const d = useWardrobe.getState().canvasDraft;
      const last = d[d.length - 1];
      if (last) setSelectedId(last.id);
    }, 0);
    flash("Added to your look");
  };

  const close = () => {
    setSelectedId(null);
    setView("outfits");
  };

  const doSave = () => {
    const ids = [...new Set(canvasDraft.map((c) => c.itemId))];
    if (ids.length === 0) return;
    const name = saveName.trim() || `Look · ${new Date().toLocaleDateString("en-US")}`;
    saveOutfit(name, "", ids);
    clearDraft();
    setSaving(false);
    setSaveName("");
    setSelectedId(null);
    setView("outfits");
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      {/* header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="flex h-9 w-9 items-center justify-center text-foreground"
        >
          <X size={26} />
        </button>
        <button
          type="button"
          onClick={() => setSaving(true)}
          disabled={canvasDraft.length === 0}
          className="rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          Next
        </button>
      </div>

      {/* board */}
      <div className="min-h-0 flex-1 px-4 pb-3">
        <div className="relative h-full w-full overflow-hidden rounded-3xl border border-line bg-white touch-none">
          {canvasDraft.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-muted">
              <LayoutGrid size={26} strokeWidth={1.6} />
              <p className="mt-2 text-sm">Tap a piece below to start your look</p>
            </div>
          )}

          {canvasDraft.map((c) => {
            const item = items.find((i) => i.id === c.itemId);
            if (!item) return null;
            const isSel = selectedId === c.id;
            return (
              <Rnd
                key={c.id}
                size={{ width: c.width, height: c.height }}
                position={{ x: c.x, y: c.y }}
                bounds="parent"
                lockAspectRatio
                onDragStart={() => select(c.id)}
                onDragStop={(_e, d) => updateCanvasItem(c.id, { x: d.x, y: d.y })}
                onResizeStop={(_e, _dir, ref, _delta, pos) =>
                  updateCanvasItem(c.id, {
                    width: parseInt(ref.style.width, 10),
                    height: parseInt(ref.style.height, 10),
                    ...pos,
                  })
                }
                enableResizing={{ bottomRight: isSel }}
                resizeHandleComponent={{
                  bottomRight: (
                    <div className="flex h-9 w-9 translate-x-1 translate-y-1 items-center justify-center rounded-full border border-line bg-white text-foreground shadow-md">
                      <Maximize2 size={15} />
                    </div>
                  ),
                }}
                style={{ zIndex: c.zIndex }}
                className="touch-none"
              >
                <div
                  className={`relative h-full w-full rounded-xl ${isSel ? "ring-2 ring-accent ring-offset-2" : ""}`}
                  onPointerDown={() => select(c.id)}
                >
                  {isSel && (
                    <div className="absolute -top-12 left-0 right-0 z-50 flex items-center justify-between">
                      <button
                        type="button"
                        aria-label="Flip"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCanvasItem(c.id, { flipped: !c.flipped });
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white shadow-md"
                      >
                        <FlipHorizontal size={17} />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCanvasItem(c.id);
                          setSelectedId(null);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-foreground shadow-md"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    draggable={false}
                    className="pointer-events-none h-full w-full object-contain"
                    style={{ transform: c.flipped ? "scaleX(-1)" : "scaleX(1)" }}
                  />
                </div>
              </Rnd>
            );
          })}

          {/* on-board editor toolbar */}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-line bg-white px-1.5 py-1.5 shadow-lg">
            <button className="flex h-10 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-label="Canvas">
              <LayoutGrid size={20} />
            </button>
            <button onClick={() => soon("Photos")} className="flex h-10 w-11 items-center justify-center rounded-xl text-muted" aria-label="Add photo">
              <ImageIcon size={20} />
            </button>
            <button onClick={() => soon("Text")} className="flex h-10 w-11 items-center justify-center rounded-xl text-muted" aria-label="Add text">
              <Type size={20} />
            </button>
            <button onClick={() => soon("Stickers")} className="flex h-10 w-11 items-center justify-center rounded-xl text-muted" aria-label="Stickers">
              <Sticker size={20} />
            </button>
            <span className="mx-0.5 h-6 w-px bg-line" />
            <button onClick={() => soon("More tools")} className="flex h-10 w-9 items-center justify-center rounded-xl text-muted" aria-label="More">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Select-item sheet */}
      <div
        className="flex max-h-[44%] flex-col rounded-t-3xl border-t border-line bg-surface"
        onPointerDown={() => setSelectedId(null)}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line" />
        <h3 className="py-2.5 text-center text-base font-semibold">Select item</h3>

        <div className="flex gap-2.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          <button onClick={() => soon("Filters")} className="flex h-9 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted">
            <SlidersHorizontal size={17} />
          </button>
          <button onClick={() => soon("Filters")} className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 text-[13px]">
            All clothes <ChevronDown size={14} className="text-muted" />
          </button>
          <button onClick={() => soon("Sort")} className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 text-[13px]">
            Recently added <ChevronDown size={14} className="text-muted" />
          </button>
        </div>

        <div className="flex gap-6 border-b border-line px-5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative pb-3 pt-1 text-[15px] ${tab === t.key ? "font-medium text-foreground" : "text-muted"}`}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
              )}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(10px,env(safe-area-inset-bottom))]">
          {pieces.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              No pieces here yet — add clothes to your closet first.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-px bg-line">
              {pieces.map((item) => (
                <button
                  key={item.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => addPiece(item.id)}
                  className="bg-surface px-2.5 pb-3 pt-2.5 text-left"
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                    <PieceThumb item={item} />
                  </div>
                  <p className="mt-2 truncate text-[10.5px] font-semibold uppercase tracking-wide">
                    {item.brand || "No Brand"}
                  </p>
                  <p className="text-[10px] text-muted">{shortDate(item.createdAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* name + save */}
      {saving && (
        <div className="absolute inset-0 z-[80] flex items-end bg-black/30" onClick={() => setSaving(false)}>
          <div className="w-full rounded-t-3xl bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <h3 className="heading text-xl">Name your look</h3>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={`Look · ${new Date().toLocaleDateString("en-US")}`}
              className="mt-3 w-full rounded-xl border border-line bg-background px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <div className="mt-4 flex gap-2.5">
              <button onClick={() => setSaving(false)} className="flex-1 rounded-xl border border-line py-3 text-sm">
                Cancel
              </button>
              <button onClick={doSave} className="flex-[2] rounded-xl bg-accent py-3 text-sm font-medium text-accent-foreground">
                Save to Outfits
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[46%] z-[90] flex justify-center px-4">
          <p className="rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg">{toast}</p>
        </div>
      )}
    </div>
  );
}

function PieceThumb({ item }: { item: WardrobeItem }) {
  const [err, setErr] = useState(false);
  if (err || !item.imageUrl) {
    return <div className="h-full w-full" style={{ background: item.color }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt={item.name}
      onError={() => setErr(true)}
      className="h-full w-full object-contain p-1.5"
    />
  );
}
