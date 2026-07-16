"use client";

import { Rnd } from "react-rnd";
import {
  ChevronDown,
  ChevronRight,
  FlipHorizontal,
  Image as ImageIcon,
  LayoutGrid,
  Maximize2,
  RotateCw,
  SlidersHorizontal,
  Sticker,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWardrobe } from "@/lib/store";
import type { Category, WardrobeItem } from "@/lib/types";

type Mode = "items" | "background" | "text" | "sticker";

/* Category tabs → which item categories each shows. */
const TABS: { key: string; label: string; cats: Category[] | null }[] = [
  { key: "all", label: "All", cats: null },
  { key: "tops", label: "Tops", cats: ["top", "outerwear", "dress"] },
  { key: "pants", label: "Pants", cats: ["bottom"] },
  { key: "shoes", label: "Shoes", cats: ["shoes"] },
];

const SHEET_TITLE: Record<Mode, string> = {
  items: "Select item",
  background: "Backgrounds",
  text: "Text",
  sticker: "Stickers",
};

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

const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-US");

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
    clearDraft,
    saveOutfit,
    setView,
  } = useWardrobe();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("all");
  const [mode, setMode] = useState<Mode>("items");
  const [stickerCat, setStickerCat] = useState(STICKER_CATS[0]);
  const [textInput, setTextInput] = useState("");
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [aspect, setAspect] = useState<"3:4" | "1:1">("3:4");
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [offset, setOffset] = useState(0); // sheet px offset: 0 = open, maxOffset = fully hidden
  const [maxOffset, setMaxOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startOffset: number } | null>(null);
  // Collapsed peek is tall enough that the grab bar sits well above the iOS
  // home-swipe strip at the very bottom (avoids fighting the system gesture).
  const PEEK = 72;
  const BOARD_GAP = 14; // gap kept between the board bottom and the sheet top
  const expanded = maxOffset === 0 ? true : offset < maxOffset * 0.5;

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
      const reserveNum =
        maxOffset === 0
          ? Math.round(window.innerHeight * 0.44)
          : maxOffset + PEEK - offset;
      const availW = el.clientWidth - 32;
      const availH = el.clientHeight - reserveNum - BOARD_GAP - 8;
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
  }, [offset, aspect, maxOffset]);

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

  // Drag the rotate handle: angle from the item's center to the pointer. react-rnd doesn't
  // rotate, so we compute it and write CanvasItem.rotation (applied as a transform on render).
  const startRotate = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const wrapper = (e.currentTarget as HTMLElement).closest("[data-canvas-wrapper]");
    if (!wrapper) return;
    const box = wrapper.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const move = (ev: PointerEvent) => {
      const deg = Math.round((Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90);
      updateCanvasItem(id, { rotation: deg });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
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

  // The toolbar shrinks while the sheet is up (small canvas) so it never
  // overfills the board, and returns to full size when the sheet is down.
  const compactBar = expanded;
  const toolBtn = (m: Mode, Icon: LucideIcon, label: string) => {
    const active = mode === m && expanded;
    return (
      <button
        onClick={() => openTool(m)}
        aria-label={label}
        className={`flex items-center justify-center rounded-xl ${
          compactBar ? "h-8 w-9" : "h-10 w-11"
        } ${active ? "bg-accent-soft text-accent" : "text-muted"}`}
      >
        <Icon size={compactBar ? 17 : 20} />
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

      {/* aspect toggle — only while the canvas is large (sheet down). The ratio
          choice isn't useful on the small canvas, and hiding it frees space so
          the canvas grows a little when the sheet is up. */}
      {!expanded && (
        <div className="flex items-center justify-center gap-7 pb-1.5">
          <AspectBtn active={aspect === "3:4"} label="3:4" onClick={() => setAspect("3:4")} />
          <AspectBtn active={aspect === "1:1"} label="1:1" square onClick={() => setAspect("1:1")} />
        </div>
      )}

      {/* board — reserves the space above the sheet (shrinks as the sheet
          slides down), then contain-fits the 3:4/1:1 board into it */}
      <div
        ref={areaRef}
        className="relative min-h-0 flex-1"
        style={{
          paddingBottom: `calc(${reserveCss} + ${BOARD_GAP}px)`,
          transition: dragging ? "none" : "padding-bottom 260ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div className="flex h-full items-start justify-center px-4 pt-1">
          <div
            className="relative overflow-hidden rounded-3xl border border-line touch-none"
            style={{
              width: board.w || undefined,
              height: board.h || undefined,
              background: canvasBg || "#ffffff",
              transition: dragging
                ? "none"
                : "width 260ms cubic-bezier(0.22,1,0.36,1), height 260ms cubic-bezier(0.22,1,0.36,1)",
            }}
          >
          {canvasDraft.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-muted">
              <LayoutGrid size={26} strokeWidth={1.6} />
              <p className="mt-2 text-sm">Tap a piece below to start your look</p>
            </div>
          )}

          {canvasDraft.map((c) => {
            const isSel = selectedId === c.id;
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
              <Rnd
                key={c.id}
                size={{ width: c.width, height: c.height }}
                position={{ x: c.x, y: c.y }}
                bounds="parent"
                lockAspectRatio={c.kind !== "text"}
                // The selected-item controls (flip/rotate/delete) carry
                // `canvas-ctrl`. react-draggable binds touchstart as a native,
                // non-passive listener on this node and preventDefaults it,
                // which cancels the synthetic click on iOS — so a plain onClick
                // never fires on the phone. `cancel` makes react-draggable bail
                // out before that preventDefault when the touch starts on a
                // control, letting the tap through.
                cancel=".canvas-ctrl"
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
                  data-canvas-wrapper
                  className={`relative h-full w-full rounded-xl ${isSel ? "ring-2 ring-accent ring-offset-2" : ""}`}
                  onPointerDown={() => select(c.id)}
                >
                  {isSel && (
                    <div className="absolute -top-12 left-0 right-0 z-50 flex items-center justify-between">
                      {c.kind !== "text" ? (
                        <button
                          type="button"
                          aria-label="Flip"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCanvasItem(c.id, { flipped: !c.flipped });
                          }}
                          className="canvas-ctrl flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white shadow-md"
                        >
                          <FlipHorizontal size={17} />
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        aria-label="Rotate"
                        onPointerDown={(e) => startRotate(e, c.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        className="canvas-ctrl flex h-9 w-9 cursor-grab items-center justify-center rounded-full border border-line bg-white text-foreground shadow-md active:cursor-grabbing"
                      >
                        <RotateCw size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCanvasItem(c.id);
                          setSelectedId(null);
                        }}
                        className="canvas-ctrl flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-foreground shadow-md"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                  <div
                    className="h-full w-full"
                    style={{
                      transform: `rotate(${c.rotation}deg)`,
                      filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.18))",
                    }}
                  >
                    {content}
                  </div>
                </div>
              </Rnd>
            );
          })}

          </div>
        </div>

        {/* editor toolbar — anchored just above the sheet so it rides down with
            the sheet when it's pulled down, while keeping its position at the
            canvas bottom when the sheet is up */}
        <div
          className={`pointer-events-none absolute inset-x-0 z-40 flex px-4 ${
            toolbarOpen ? "justify-center" : "justify-end"
          }`}
          style={{
            bottom: `calc(${reserveCss} + 26px)`,
            transition: dragging ? "none" : "bottom 260ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          {toolbarOpen ? (
            <div
              className={`pointer-events-auto flex items-center rounded-2xl border border-line bg-white/95 shadow-lg backdrop-blur-sm ${
                compactBar ? "gap-0.5 px-1 py-1" : "gap-1 px-1.5 py-1.5"
              }`}
            >
              {toolBtn("items", LayoutGrid, "Items")}
              {toolBtn("background", ImageIcon, "Background")}
              {toolBtn("text", Type, "Text")}
              {toolBtn("sticker", Sticker, "Stickers")}
              <span className={`mx-0.5 w-px bg-line ${compactBar ? "h-5" : "h-6"}`} />
              <button
                onClick={() => setToolbarOpen(false)}
                className={`flex items-center justify-center rounded-xl text-muted ${
                  compactBar ? "h-8 w-8" : "h-10 w-9"
                }`}
                aria-label="Hide toolbar"
              >
                <ChevronRight size={compactBar ? 17 : 20} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setToolbarOpen(true)}
              aria-label="Show toolbar"
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white text-foreground shadow-lg"
            >
              <LayoutGrid size={22} />
            </button>
          )}
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
              <div className="flex gap-2.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
                <button className="flex h-9 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted">
                  <SlidersHorizontal size={17} />
                </button>
                <button className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 text-[13px]">
                  All clothes <ChevronDown size={14} className="text-muted" />
                </button>
                <button className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 text-[13px]">
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

function AspectBtn({
  active,
  label,
  square,
  onClick,
}: {
  active: boolean;
  label: string;
  square?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1">
      <span
        className={`rounded-[3px] border-2 ${square ? "h-[22px] w-[22px]" : "h-[26px] w-[19px]"} ${
          active ? "border-foreground bg-foreground/10" : "border-muted/50"
        }`}
      />
      <span className={`text-[11px] ${active ? "font-medium text-foreground" : "text-muted"}`}>
        {label}
      </span>
    </button>
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
