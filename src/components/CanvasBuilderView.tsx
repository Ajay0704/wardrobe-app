"use client";

import {
  ArrowUp,
  Copy,
  FlipHorizontal,
  Image as ImageIcon,
  LayoutGrid,
  Shirt,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { bestLook } from "@/lib/matching";
import { useWardrobe } from "@/lib/store";
import type { CanvasItem, Category, WardrobeItem } from "@/lib/types";
import { matchesSubcategory, presentSubcategories, slotForCategory } from "@/lib/types";
import { CanvasPiece } from "./CanvasPiece";
import { Chip } from "./ui";

type Mode = "items" | "background" | "text" | "sticker";

/* One tab per category (AJA-229), with a sub-category chip row underneath. */
const TABS: { key: string; label: string; cat: Category | null }[] = [
  { key: "all", label: "All", cat: null },
  { key: "top", label: "Tops", cat: "top" },
  { key: "bottom", label: "Bottoms", cat: "bottom" },
  { key: "dress", label: "Dresses", cat: "dress" },
  { key: "outerwear", label: "Outerwear", cat: "outerwear" },
  { key: "shoes", label: "Shoes", cat: "shoes" },
  { key: "bag", label: "Bags", cat: "bag" },
  { key: "accessory", label: "Accessories", cat: "accessory" },
];

const SHEET_TITLE: Record<Mode, string> = {
  items: "Add pieces",
  background: "Board",
  text: "Text",
  sticker: "Stickers",
};

// Collapsed sheet peek height (grab bar sits above the iOS home-swipe strip); BOARD_RESERVE is the
// fixed strip below the board (peek + floating toolbar) so the board fills the page and never
// resizes with the sheet drag (AJA-232).
const PEEK = 72;
const BOARD_RESERVE = PEEK + 96;

const TEXT_COLORS = ["#1c1917", "#ffffff", "#b05e3c", "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#ec4899"];

const BG_SOLIDS = ["#ffffff", "#faf9f7", "#f3f1ed", "#ece4d4", "#f6e9e2", "#e6ece2", "#e4eef3", "#1c1917"];
const BG_GRADIENTS = [
  "linear-gradient(180deg,#faf9f7,#e7e4de)",
  "linear-gradient(135deg,#f6e9e2,#e4eef3)",
  "linear-gradient(135deg,#e6ece2,#faf9f7)",
  "radial-gradient(circle at 50% 30%,#f6e9e2,#faf9f7)",
  "linear-gradient(180deg,#e4eef3,#faf9f7)",
  "linear-gradient(135deg,#1c1917,#57534e)",
];

const STICKERS: Record<string, string[]> = {
  Smileys: ["😀", "😄", "😍", "🥰", "😎", "🤩", "😌", "🙃", "😴", "😭", "🥺", "🤔", "😇", "🥳", "😤", "🫶"],
  Hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💗", "💕", "💖", "💘", "💝", "💞", "✨", "💫"],
  Nature: ["🌸", "🌷", "🌿", "🍀", "🌵", "🌻", "🍁", "🍂", "🔥", "⭐", "🌙", "☀️", "☁️", "🌈", "🌊", "❄️"],
  Fashion: ["👑", "👜", "👛", "🎒", "👟", "👠", "👢", "🕶️", "🧢", "🧣", "💍", "💄", "👗", "👖", "🧥", "🛍️"],
  Fun: ["🎉", "🎈", "🎀", "💯", "⚡", "💫", "🍿", "☕", "🍦", "🍩", "🎧", "📸", "💬", "🏷️", "✅", "🌟"],
};
const STICKER_CATS = Object.keys(STICKERS);

/**
 * Acloset-style outfit maker. Full-screen over the shell: a white board where
 * cutout pieces + text + emoji stickers are dragged / resized / flipped /
 * layered, an on-board editor toolbar, a board-background picker, and a
 * collapsible "Select item" sheet whose contents switch with the active tool.
 */
export function CanvasBuilderView() {
  const {
    items,
    canvasDraft,
    canvasBg,
    addCanvasItem,
    addCanvasText,
    addCanvasSticker,
    updateCanvasItem,
    removeCanvasItem,
    setCanvasBg,
    setCanvasDraft,
    clearDraft,
    saveOutfit,
    setView,
  } = useWardrobe();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null); // long-press control cluster
  const trashRef = useRef<HTMLDivElement | null>(null); // drag-to-delete zone (toggled imperatively)
  const [tab, setTab] = useState("all");
  const [subCat, setSubCat] = useState("all");
  const [mode, setMode] = useState<Mode>("items");
  const [stickerCat, setStickerCat] = useState(STICKER_CATS[0]);
  const [textInput, setTextInput] = useState("");
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [aspect, setAspect] = useState<"3:4" | "1:1">("3:4");
  const [offset, setOffset] = useState(0); // sheet px offset: 0 = open, maxOffset = fully hidden
  const [maxOffset, setMaxOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startOffset: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const h = sheetRef.current?.offsetHeight ?? 0;
      setMaxOffset(Math.max(0, h - PEEK));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Contain-fit the board into the space above the sheet, keeping its 3:4/1:1
  // aspect. Measured from the stable outer area minus the *target* reserve for
  // the current offset — not the transitioning padded stage — so the size is
  // correct immediately when a tool tap expands the sheet (no lag/overlap).
  const areaRef = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const fit = () => {
      const el = areaRef.current;
      if (!el) return;
      // Fill the board like Pinterest: reserve only the collapsed peek + toolbar strip (a fixed
      // amount, NOT the open sheet or the live drag `offset`), so the board grows to fill the width
      // and stays a stable large size — the sheet just overlays the board's bottom when expanded.
      const reserveNum = BOARD_RESERVE;
      const availW = el.clientWidth - 24;
      const availH = el.clientHeight - reserveNum;
      if (availW <= 0 || availH <= 0) return;
      const ratio = aspect === "3:4" ? 3 / 4 : 1; // w / h
      let w = availH * ratio;
      let h = availH;
      if (w > availW) {
        w = availW;
        h = availW / ratio;
      }
      setBoard({ w: Math.round(w), h: Math.round(h) });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [aspect]);

  const expand = () => setOffset(0);
  const startDrag = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, startOffset: offset };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const next = drag.current.startOffset + (e.clientY - drag.current.startY);
    setOffset(Math.min(Math.max(next, 0), maxOffset));
  };
  const endDrag = (e: React.PointerEvent) => {
    const dc = drag.current;
    if (!dc) return;
    const d = e.clientY - dc.startY;
    drag.current = null;
    setDragging(false);
    if (Math.abs(d) < 6) {
      setOffset(dc.startOffset > maxOffset * 0.5 ? 0 : maxOffset); // tap toggles
    } else {
      const cur = Math.min(Math.max(dc.startOffset + d, 0), maxOffset);
      setOffset(cur > maxOffset * 0.4 ? maxOffset : 0); // snap to nearest
    }
  };

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1800);
  };

  const openTool = (m: Mode) => {
    setMode(m);
    expand();
  };

  const pieces = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    return items.filter(
      (it) =>
        !it.wishlist &&
        it.imageUrl &&
        (t.cat === null || it.category === t.cat) &&
        matchesSubcategory(it, subCat),
    );
  }, [items, tab, subCat]);

  // Sub-category chips present in the active category's addable pieces (+ Others).
  const subChips = useMemo(() => {
    const t = TABS.find((x) => x.key === tab);
    return t?.cat
      ? presentSubcategories(t.cat, items.filter((it) => !it.wishlist && it.imageUrl))
      : [];
  }, [items, tab]);

  const ownedCount = useMemo(
    () => items.filter((it) => !it.wishlist && it.imageUrl).length,
    [items],
  );

  const bringToFront = (id: string) => {
    const top = canvasDraft.reduce((m, c) => Math.max(m, c.zIndex), 0);
    updateCanvasItem(id, { zIndex: top + 1 });
  };
  const select = (id: string) => {
    setSelectedId(id);
    bringToFront(id);
  };
  const deletePiece = (id: string) => {
    removeCanvasItem(id);
    if (selectedId === id) setSelectedId(null);
    if (menuId === id) setMenuId(null);
  };
  const duplicatePiece = (id: string) => {
    const c = canvasDraft.find((x) => x.id === id);
    if (!c) return;
    const top = canvasDraft.reduce((m, x) => Math.max(m, x.zIndex), 0);
    const copy: CanvasItem = { ...c, id: `dup-${Date.now()}`, x: c.x + 22, y: c.y + 22, zIndex: top + 1 };
    setCanvasDraft([...canvasDraft, copy]);
    setSelectedId(copy.id);
    setMenuId(copy.id);
  };
  const selectLast = () => {
    window.setTimeout(() => {
      const d = useWardrobe.getState().canvasDraft;
      const last = d[d.length - 1];
      if (last) setSelectedId(last.id);
    }, 0);
  };

  const addPiece = (itemId: string) => {
    addCanvasItem(itemId);
    selectLast();
    flash("Added to your look");
  };

  // Surprise me — ask the matching engine for a look, then lay it out head-to-toe
  // (top over bottom over shoes), centered and sized by slot, as a fresh board.
  const surpriseLook = () => {
    const owned = items.filter((it) => !it.wishlist && it.imageUrl);
    const ids = bestLook(owned)?.itemIds ?? [];
    const picks = ids
      .map((id) => owned.find((it) => it.id === id))
      .filter((it): it is WardrobeItem => !!it);
    if (picks.length === 0) {
      flash("Add clothes to your closet first");
      return;
    }
    // Styled collage (AJA-232): top + bottom on the LEFT, outerwear + accessories on the RIGHT,
    // shoes bottom-right — bucketed by outfit slot, placed in board pixels + clamped to the board.
    const bw = board.w || 260;
    const bh = board.h || 340;
    const S = Math.round(bw * 0.42);
    const Sh = Math.round(bw * 0.34);
    const leftX = Math.round(bw * 0.04);
    const rightX = Math.round(bw * 0.54);
    const bySlot: Partial<Record<string, WardrobeItem[]>> = {};
    for (const it of picks) (bySlot[slotForCategory(it.category)] ??= []).push(it);
    const nodes: CanvasItem[] = [];
    let z = 0;
    const clampN = (v: number, hi: number) => Math.max(0, Math.min(Math.round(v), hi));
    const put = (it: WardrobeItem, x: number, y: number, size: number) => {
      nodes.push({
        id: `sp-${Date.now()}-${z}`,
        kind: "item",
        itemId: it.id,
        x: clampN(x, bw - size),
        y: clampN(y, bh - size),
        width: size,
        height: size,
        rotation: 0,
        zIndex: z++,
        flipped: false,
      });
    };
    if (bySlot.dress?.length) {
      put(bySlot.dress[0], leftX, bh * 0.14, S); // dress fills the left on its own
    } else {
      if (bySlot.top?.length) put(bySlot.top[0], leftX, bh * 0.06, S);
      if (bySlot.bottom?.length) put(bySlot.bottom[0], leftX, bh * 0.46, S);
    }
    let ry = bh * 0.05;
    if (bySlot.outerwear?.length) {
      put(bySlot.outerwear[0], rightX, ry, S);
      ry = bh * 0.44;
    }
    (bySlot.accessories ?? []).slice(0, 2).forEach((it, i) => {
      put(it, rightX + i * Sh * 0.3, ry + i * Sh * 0.55, Sh);
    });
    if (bySlot.shoes?.length) put(bySlot.shoes[0], rightX, bh * 0.66, Sh);
    setCanvasDraft(nodes);
    setSelectedId(null);
    setMenuId(null);
    flash("Here's a look — tweak it");
  };
  const addText = () => {
    const t = textInput.trim();
    if (!t) return;
    addCanvasText(t, textColor);
    setTextInput("");
    selectLast();
    flash("Text added");
  };
  const addSticker = (emoji: string) => {
    addCanvasSticker(emoji);
    selectLast();
  };

  const close = () => {
    setSelectedId(null);
    setView("outfits");
  };

  const doSave = () => {
    const ids = [...new Set(canvasDraft.filter((c) => c.itemId).map((c) => c.itemId as string))];
    if (canvasDraft.length === 0) return;
    const name = saveName.trim() || `Look · ${new Date().toLocaleDateString("en-US")}`;
    // Persist the full board layout (positions/sizes/rotation/z + text/stickers + bg),
    // not just the item ids, so the board restores exactly on reopen.
    saveOutfit(name, "", ids, canvasDraft, canvasBg);
    clearDraft();
    setSaving(false);
    setSaveName("");
    setSelectedId(null);
    setView("outfits");
  };

  // Labelled tool button; a sliding pill (below) marks the active one.
  const TOOL_ORDER: Mode[] = ["items", "background", "text", "sticker"];
  const toolBtn = (m: Mode, Icon: LucideIcon, label: string) => {
    const active = mode === m;
    return (
      <button
        type="button"
        onClick={() => openTool(m)}
        aria-label={label}
        className={`relative z-[1] flex h-12 w-[68px] flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors active:scale-95 ${
          active ? "text-accent" : "text-muted"
        }`}
      >
        <Icon size={19} strokeWidth={1.9} />
        <span className="text-[11px] font-medium">{label}</span>
      </button>
    );
  };

  // Space reserved for the sheet (shrinks as it slides down). Both the board
  // padding and the floating toolbar anchor off this so the toolbar rides down
  // with the sheet and stays just above it.
  const reserve = maxOffset === 0 ? null : maxOffset + PEEK - offset;
  const reserveCss = reserve === null ? "var(--sheet-h)" : `${reserve}px`;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-background"
      style={{ "--sheet-h": "44vh" } as React.CSSProperties}
    >
      {/* header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-foreground transition-transform active:scale-95"
        >
          <X size={20} />
        </button>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-foreground">New look</p>
          <p className="text-[11px] text-muted">
            {canvasDraft.length === 0
              ? "No pieces yet"
              : `${canvasDraft.length} ${canvasDraft.length === 1 ? "piece" : "pieces"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSaving(true)}
          disabled={canvasDraft.length === 0}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors active:scale-95 ${
            canvasDraft.length === 0
              ? "bg-surface-2 text-muted"
              : "bg-accent text-accent-foreground"
          }`}
        >
          Next
        </button>
      </div>

      {/* board — reserves the OPEN sheet height (fixed, so the board never resizes when the sheet
          is dragged) and centres the board in that space; collapsing the sheet grows the margin */}
      <div
        ref={areaRef}
        className="relative min-h-0 flex-1"
        style={{ paddingBottom: `${BOARD_RESERVE}px` }}
      >
        {/* aspect chip — a small, always-there formatting control on the canvas */}
        <div className="absolute right-5 top-2 z-30 flex overflow-hidden rounded-full border border-line bg-surface/95 backdrop-blur-sm">
          {(["3:4", "1:1"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setAspect(r)}
              className={`px-3 py-1 text-[12px] font-medium transition-colors active:scale-95 ${
                aspect === r ? "bg-accent text-accent-foreground" : "text-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="flex h-full items-center justify-center px-3">
          <div
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedId(null);
                setMenuId(null);
              }
            }}
            className="relative overflow-hidden rounded-3xl border border-line touch-none"
            style={{
              width: board.w || undefined,
              height: board.h || undefined,
              background: canvasBg || "#ffffff",
              transition: "width 260ms cubic-bezier(0.22,1,0.36,1), height 260ms cubic-bezier(0.22,1,0.36,1)",
            }}
          >
          {canvasDraft.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-muted">
                <Shirt size={28} strokeWidth={1.6} />
              </span>
              <p className="mt-3.5 text-[15px] font-semibold text-foreground">Build your look</p>
              <p className="mt-1 text-[13px] text-muted">Tap pieces below — they drop in here</p>
              <button
                type="button"
                onClick={surpriseLook}
                className="pointer-events-auto mt-3.5 flex items-center gap-1.5 rounded-full bg-accent-soft px-4 py-2 text-[13px] font-semibold text-accent transition-transform active:scale-95"
              >
                <Sparkles size={15} /> Surprise me
              </button>
            </div>
          )}

          {canvasDraft.map((c) => {
            let content: React.ReactNode;
            if (c.kind === "text") {
              content = (
                <div
                  className="pointer-events-none flex h-full w-full items-center justify-center text-center"
                  style={{
                    color: c.color || "#1c1917",
                    fontSize: Math.max(12, c.height * 0.5),
                    fontWeight: 600,
                    lineHeight: 1.1,
                    transform: c.flipped ? "scaleX(-1)" : "scaleX(1)",
                    wordBreak: "break-word",
                  }}
                >
                  {c.text}
                </div>
              );
            } else if (c.kind === "sticker") {
              content = (
                <div
                  className="pointer-events-none flex h-full w-full items-center justify-center"
                  style={{
                    fontSize: Math.min(c.width, c.height) * 0.82,
                    lineHeight: 1,
                    transform: c.flipped ? "scaleX(-1)" : "scaleX(1)",
                  }}
                >
                  {c.emoji}
                </div>
              );
            } else {
              const item = items.find((i) => i.id === c.itemId);
              if (!item) return null;
              content = (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  draggable={false}
                  className="pointer-events-none h-full w-full object-contain"
                  style={{ transform: c.flipped ? "scaleX(-1)" : "scaleX(1)" }}
                />
              );
            }

            return (
              <CanvasPiece
                key={c.id}
                c={c}
                board={board}
                selected={selectedId === c.id}
                onSelect={select}
                onLongPress={(id) => {
                  setSelectedId(id);
                  setMenuId(id);
                }}
                onCommit={updateCanvasItem}
                onRemove={deletePiece}
                trashRef={trashRef}
              >
                {content}
              </CanvasPiece>
            );
          })}

          {/* long-press control cluster — floats just above the pressed piece */}
          {menuId &&
            (() => {
              const c = canvasDraft.find((x) => x.id === menuId);
              if (!c) return null;
              const btn =
                "flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-foreground transition-transform active:scale-90";
              return (
                <div
                  className="animate-canvas-pop absolute z-[60] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-white/95 p-1.5 shadow-lg backdrop-blur-sm"
                  style={{
                    left: Math.max(72, Math.min((board.w || 260) - 72, c.x + c.width / 2)),
                    top: Math.max(4, c.y - 50),
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {c.kind !== "text" && (
                    <button type="button" aria-label="Flip" className={btn} onClick={() => updateCanvasItem(c.id, { flipped: !c.flipped })}>
                      <FlipHorizontal size={16} />
                    </button>
                  )}
                  <button type="button" aria-label="Duplicate" className={btn} onClick={() => duplicatePiece(c.id)}>
                    <Copy size={16} />
                  </button>
                  <button type="button" aria-label="Bring to front" className={btn} onClick={() => bringToFront(c.id)}>
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/12 text-red-600 transition-transform active:scale-90"
                    onClick={() => deletePiece(c.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })()}

          {/* drag-to-delete drop zone — shown/hot toggled imperatively by CanvasPiece via trashRef */}
          <div
            ref={trashRef}
            className="pointer-events-none absolute bottom-3 left-1/2 z-[55] flex h-16 w-16 items-center justify-center rounded-full border"
            style={{
              opacity: 0,
              transform: "translateX(-50%) translateY(20px)",
              background: "rgba(239,68,68,0.10)",
              borderColor: "rgba(248,113,113,0.6)",
              transition: "opacity 0.2s, transform 0.2s, background 0.2s, border-color 0.2s",
            }}
          >
            <Trash2 size={24} className="text-red-500" />
          </div>

          </div>
        </div>

        {/* editor toolbar — labelled tools with a sliding highlight; anchored just
            above the sheet so it rides down when the sheet is pulled down */}
        <div
          className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4"
          style={{
            bottom: `calc(${reserveCss} + 26px)`,
            transition: dragging ? "none" : "bottom 260ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <div className="pointer-events-auto relative flex items-center gap-1 rounded-[22px] border border-line bg-white/95 p-1 shadow-lg backdrop-blur-sm">
            <span
              aria-hidden
              className="absolute left-1 top-1 h-12 w-[68px] rounded-2xl bg-accent-soft transition-transform duration-300"
              style={{
                transform: `translateX(${TOOL_ORDER.indexOf(mode) * 72}px)`,
                transitionTimingFunction: "cubic-bezier(0.34,1.4,0.5,1)",
              }}
            />
            {toolBtn("items", LayoutGrid, "Items")}
            {toolBtn("background", ImageIcon, "Board")}
            {toolBtn("text", Type, "Text")}
            {toolBtn("sticker", Sticker, "Stickers")}
          </div>
        </div>
      </div>

      {/* bottom sheet — fixed-height overlay that slides up/down (smooth),
          so switching tools never resizes the board */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 z-[72] flex flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-8px_30px_rgba(28,25,23,0.08)]"
        style={{
          height: "var(--sheet-h)",
          transform: `translateY(${offset}px)`,
          transition: dragging ? "none" : "transform 260ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* draggable header — a slim grab bar (h = PEEK) stays visible at the
            screen bottom when collapsed, so the sheet can always be pulled up */}
        <div
          className="shrink-0 cursor-grab touch-none select-none"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        >
          <div className="flex h-10 items-center justify-center">
            <span className="h-1 w-10 rounded-full bg-line" />
          </div>
          <h3 className="pb-2 text-center text-base font-semibold">{SHEET_TITLE[mode]}</h3>
        </div>

          {/* ITEMS */}
          {mode === "items" && (
            <>
              <div className="flex items-center justify-between px-4 pb-3">
                <p className="text-[13px] text-muted">
                  Your closet · {ownedCount} {ownedCount === 1 ? "piece" : "pieces"}
                </p>
                <button
                  type="button"
                  onClick={surpriseLook}
                  className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-semibold text-accent transition-transform active:scale-95"
                >
                  <Sparkles size={14} /> Surprise me
                </button>
              </div>
              <div className="flex gap-6 overflow-x-auto border-b border-line px-5">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTab(t.key);
                      setSubCat("all");
                    }}
                    className={`relative shrink-0 pb-3 pt-1 text-[15px] ${tab === t.key ? "font-medium text-foreground" : "text-muted"}`}
                  >
                    {t.label}
                    {tab === t.key && (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
                    )}
                  </button>
                ))}
              </div>
              {subChips.length > 1 && (
                <div className="flex gap-2 overflow-x-auto px-5 pt-3">
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
              <div className="min-h-0 flex-1 overflow-y-auto pb-[max(10px,env(safe-area-inset-bottom))]">
                {pieces.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted">
                    No pieces here yet — add clothes to your closet first.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-px bg-line">
                    {pieces.map((item, i) => (
                      <button
                        key={item.id}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => addPiece(item.id)}
                        style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                        className="animate-fade-up bg-surface px-2.5 pb-3 pt-2.5 text-left transition-transform active:scale-[0.97]"
                      >
                        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                          <PieceThumb item={item} />
                        </div>
                        <p className="mt-2 truncate text-[11px] font-medium text-foreground">
                          {item.name || item.brand || "Untitled"}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* BACKGROUND */}
          {mode === "background" && (
            <div
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-4 gap-3">
                <button
                  onClick={() => setCanvasBg(null)}
                  className={`flex aspect-square items-center justify-center rounded-xl border bg-white text-xs text-muted ${!canvasBg ? "border-accent ring-1 ring-accent" : "border-line"}`}
                >
                  None
                </button>
                {[...BG_SOLIDS, ...BG_GRADIENTS].map((bg) => (
                  <button
                    key={bg}
                    onClick={() => setCanvasBg(bg)}
                    style={{ background: bg }}
                    className={`aspect-square rounded-xl border ${canvasBg === bg ? "border-accent ring-1 ring-accent" : "border-line"}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* TEXT */}
          {mode === "text" && (
            <div className="px-4 pb-[max(16px,env(safe-area-inset-bottom))]" onPointerDown={(e) => e.stopPropagation()}>
              <input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addText()}
                placeholder="Type something…"
                className="w-full rounded-xl border border-line bg-background px-4 py-3 text-sm outline-none focus:border-accent"
              />
              <div className="mt-3 flex flex-wrap gap-2.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setTextColor(c)}
                    style={{ background: c }}
                    className={`h-8 w-8 rounded-full border ${textColor === c ? "border-accent ring-2 ring-accent ring-offset-1" : "border-line"}`}
                  />
                ))}
              </div>
              <button
                onClick={addText}
                disabled={!textInput.trim()}
                className="mt-4 w-full rounded-xl bg-accent py-3 text-sm font-medium text-accent-foreground disabled:opacity-40"
              >
                Add to canvas
              </button>
            </div>
          )}

          {/* STICKER */}
          {mode === "sticker" && (
            <>
              <div className="flex gap-2.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
                {STICKER_CATS.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setStickerCat(cat)}
                    className={`h-9 shrink-0 rounded-full px-4 text-[13px] ${
                      stickerCat === cat ? "bg-foreground text-background" : "border border-line text-foreground"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(16px,env(safe-area-inset-bottom))]"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="grid grid-cols-5 gap-1">
                  {STICKERS[stickerCat].map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      onClick={() => addSticker(emoji)}
                      className="flex aspect-square items-center justify-center rounded-xl text-3xl hover:bg-surface-2"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
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
        <div className="pointer-events-none absolute inset-x-0 bottom-[48%] z-[90] flex justify-center px-4">
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
