"use client";

import { Rnd } from "react-rnd";
import {
  FlipHorizontal,
  Image as ImageIcon,
  LayoutGrid,
  Maximize2,
  RotateCw,
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
import type { Category, WardrobeItem } from "@/lib/types";

type Mode = "items" | "background" | "text" | "sticker";

/* Category tabs → which item categories each shows. */
const TABS: { key: string; label: string; cats: Category[] | null }[] = [
  { key: "all", label: "All", cats: null },
  { key: "tops", label: "Tops", cats: ["top", "outerwear", "dress"] },
  { key: "pants", label: "Bottoms", cats: ["bottom"] },
  { key: "shoes", label: "Shoes", cats: ["shoes"] },
];

const SHEET_TITLE: Record<Mode, string> = {
  items: "Add pieces",
  background: "Board",
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
  const [tab, setTab] = useState("all");
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
  // Collapsed peek is tall enough that the grab bar sits well above the iOS
  // home-swipe strip at the very bottom (avoids fighting the system gesture).
  const PEEK = 72;
  const BOARD_GAP = 14; // gap kept between the board bottom and the sheet top

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
    const slot: Record<string, number> = { outerwear: 0, dress: 1, top: 1, bottom: 2, shoes: 3 };
    picks.sort((a, b) => (slot[a.category] ?? 2) - (slot[b.category] ?? 2));
    const bw = board.w || 260;
    const bh = board.h || 340;
    const sizeFor = (c: Category) =>
      c === "shoes" ? bw * 0.42 : c === "bottom" ? bw * 0.52 : bw * 0.62;
    let y = bh * 0.05;
    const layout = picks.map((it, i) => {
      const size = Math.round(sizeFor(it.category));
      const node = {
        id: `sp-${Date.now()}-${i}`,
        kind: "item" as const,
        itemId: it.id,
        x: Math.round((bw - size) / 2),
        y: Math.round(y),
        width: size,
        height: size,
        rotation: 0,
        zIndex: i,
        flipped: false,
      };
      y += size * 0.72;
      return node;
    });
    setCanvasDraft(layout);
    setSelectedId(null);
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
                  className={`animate-canvas-pop relative h-full w-full rounded-xl ${isSel ? "ring-2 ring-accent ring-offset-2" : ""}`}
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
