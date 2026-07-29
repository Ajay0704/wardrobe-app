"use client";

import {
  ArrowUp,
  ChevronRight,
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
  Lock,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { bestLook } from "@/lib/matching";
import { readCachedWeather } from "@/lib/weather";
import { primaryStyleVibe } from "@/lib/profile";
import { readTaste } from "@/lib/taste";
import { useWardrobe, uid } from "@/lib/store";
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

/** Amber silhouette for a piece you don't own yet (AJA-245) — four zero-blur shadows
 *  offset on each axis, which outlines the cutout's alpha rather than its bounding box. */
const WISH_OUTLINE =
  "drop-shadow(2px 0 0 #f59e0b) drop-shadow(-2px 0 0 #f59e0b) drop-shadow(0 2px 0 #f59e0b) drop-shadow(0 -2px 0 #f59e0b)";

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
 * A shared styling session driving this same canvas (AJA-240). When present it
 * replaces the local draft as the data source, so the collaborative board IS the
 * builder rather than a lookalike that drifts from it.
 */
export interface CollabCanvas {
  nodes: CanvasItem[];
  bg: string | null;
  /** The other person's closet, already mapped to wardrobe items for the tray. */
  items: WardrobeItem[];
  aspect: "3:4" | "1:1";
  setAspect: (a: "3:4" | "1:1") => void;
  /** Mutations return the new piece id where one is created, so it can be selected. */
  add: (itemId: string) => string;
  addText: (text: string, color: string) => string;
  addSticker: (emoji: string) => string;
  update: (id: string, patch: Partial<CanvasItem>) => void;
  remove: (id: string) => void;
  replace: (nodes: CanvasItem[]) => void;
  setBg: (bg: string | null) => void;
  title: string;
  subtitle: string;
  saveLabel: string;
  canSave: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
  onEnd: () => void;
  /** Piece currently held by the OTHER person, for the presence outline. */
  heldByThem: { pieceId: string; name: string } | null;
  onGrab: (id: string) => void;
  onRelease: (id: string) => void;
}

/**
 * Acloset-style outfit maker. Full-screen over the shell: a white board where
 * cutout pieces + text + emoji stickers are dragged / resized / flipped /
 * layered, an on-board editor toolbar, a board-background picker, and a
 * collapsible "Select item" sheet whose contents switch with the active tool.
 */
export function CanvasBuilderView({ collab }: { collab?: CollabCanvas } = {}) {
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
    profile,
    engineV2,
  } = useWardrobe();

  // The single switch between "my draft" and "our session". Everything below reads
  // and writes through these, so the two modes can't drift apart.
  const nodes = collab ? collab.nodes : canvasDraft;
  const bg = collab ? collab.bg : canvasBg;
  const trayItems = collab ? collab.items : items;
  const updateNode = collab ? collab.update : updateCanvasItem;
  const removeNode = collab ? collab.remove : removeCanvasItem;
  const replaceNodes = collab ? collab.replace : setCanvasDraft;
  const setBgFn = collab ? collab.setBg : setCanvasBg;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const trashRef = useRef<HTMLDivElement | null>(null); // drag-to-delete zone (toggled imperatively)
  const [tab, setTab] = useState("all");
  const [subCat, setSubCat] = useState("all");
  const [mode, setMode] = useState<Mode>("items");
  const [toolbarOpen, setToolbarOpen] = useState(true); // collapse the tool pill into a side "ball"
  const [stickerCat, setStickerCat] = useState(STICKER_CATS[0]);
  const [textInput, setTextInput] = useState("");
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [localAspect, setLocalAspect] = useState<"3:4" | "1:1">("3:4");
  // Shared, not local, in a session — otherwise the two phones compose on differently
  // shaped boards.
  const aspect = collab ? collab.aspect : localAspect;
  const setAspect = collab ? collab.setAspect : setLocalAspect;
  const [offset, setOffset] = useState(0); // sheet px offset: 0 = open, maxOffset = fully hidden
  const [maxOffset, setMaxOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    startY: number;
    startOffset: number;
    lastY: number;
    lastT: number;
    vy: number; // px/ms, signed (+ = downward)
  } | null>(null);

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
  // The CANONICAL full board (sheet collapsed). Pieces live in these px coords; the board is CSS-
  // SCALED (not resized) to fit above the sheet, so pieces scale WITH it and stay composed (AJA-232
  // follow-up). Sized only by area + aspect — independent of the sheet offset.
  const [board, setBoard] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const fit = () => {
      const el = areaRef.current;
      if (!el) return;
      const availW = el.clientWidth - 24;
      const availH = el.clientHeight - BOARD_RESERVE;
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
    drag.current = { startY: e.clientY, startOffset: offset, lastY: e.clientY, lastT: performance.now(), vy: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const dc = drag.current;
    if (!dc) return;
    const now = performance.now();
    const dt = now - dc.lastT;
    if (dt > 0) dc.vy = (e.clientY - dc.lastY) / dt; // running velocity for flick detection
    dc.lastY = e.clientY;
    dc.lastT = now;
    let next = dc.startOffset + (e.clientY - dc.startY);
    // Firm stop at fully-open (top); rubber-band when over-collapsing past the peek (bottom).
    if (next < 0) next = 0;
    else if (next > maxOffset) next = maxOffset + (next - maxOffset) * 0.35;
    setOffset(next);
  };
  const FLICK = 0.4; // px/ms — above this, a flick wins over position
  const endDrag = (e: React.PointerEvent) => {
    const dc = drag.current;
    if (!dc) return;
    drag.current = null;
    setDragging(false);
    const moved = Math.abs(e.clientY - dc.startY);
    const cur = Math.min(Math.max(dc.startOffset + (e.clientY - dc.startY), 0), maxOffset);
    let open: boolean;
    if (Math.abs(dc.vy) > FLICK)
      open = dc.vy < 0; // flick up → open, flick down → collapse (momentum wins)
    else if (moved < 6)
      open = dc.startOffset > maxOffset * 0.5; // tap toggles
    else open = cur < maxOffset * 0.5; // otherwise settle to nearest
    setOffset(open ? 0 : maxOffset);
  };

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1800);
  };

  const openTool = (m: Mode) => {
    setMode(m);
    expand();
  };

  // Wishlist pieces are addable (AJA-245) — seeing a thing you don't own next to the
  // things you do is the whole question. In a shared session `collab.items` is already
  // owned-only, so a friend's board never gains your wishes.
  const addable = useMemo(
    () => trayItems.filter((it) => it.imageUrl),
    [trayItems],
  );

  const pieces = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    return addable.filter(
      (it) => (t.cat === null || it.category === t.cat) && matchesSubcategory(it, subCat),
    );
  }, [addable, tab, subCat]);

  // Sub-category chips present in the active category's addable pieces (+ Others).
  const subChips = useMemo(() => {
    const t = TABS.find((x) => x.key === tab);
    return t?.cat ? presentSubcategories(t.cat, addable) : [];
  }, [addable, tab]);

  // Counted separately: "Your closet · N" has to stay true, so the wishes are named
  // as what they are rather than folded into the closet total.
  const ownedCount = useMemo(() => addable.filter((it) => !it.wishlist).length, [addable]);
  const wishCount = useMemo(() => addable.filter((it) => it.wishlist).length, [addable]);

  const bringToFront = (id: string) => {
    const top = nodes.reduce((m, c) => Math.max(m, c.zIndex), 0);
    updateNode(id, { zIndex: top + 1 });
  };
  const select = (id: string) => {
    setSelectedId(id);
    // In a session selecting must NOT bump z: both people select constantly and the
    // boards would z-fight. Bring-to-front stays as the explicit button.
    if (!collab) bringToFront(id);
  };
  const deletePiece = (id: string) => {
    removeNode(id);
    if (selectedId === id) setSelectedId(null);
  };
  const duplicatePiece = (id: string) => {
    const c = nodes.find((x) => x.id === id);
    if (!c) return;
    const top = nodes.reduce((m, x) => Math.max(m, x.zIndex), 0);
    // uid(), not Date.now(): two clients on a shared board can duplicate in the same
    // millisecond and collide on the piece id (AJA-240).
    const copy: CanvasItem = { ...c, id: uid(), x: c.x + 22, y: c.y + 22, zIndex: top + 1 };
    replaceNodes([...nodes, copy]);
    setSelectedId(copy.id);
  };
  const selectLast = () => {
    window.setTimeout(() => {
      const d = useWardrobe.getState().canvasDraft;
      const last = d[d.length - 1];
      if (last) setSelectedId(last.id);
    }, 0);
  };

  const addPiece = (itemId: string) => {
    if (collab) setSelectedId(collab.add(itemId));
    else {
      addCanvasItem(itemId);
      selectLast();
    }
    flash("Added to your look");
  };

  // Surprise me — ask the matching engine for a look, then lay it out head-to-toe
  // (top over bottom over shoes), centered and sized by slot, as a fresh board.
  // `anchor` is the "Style it" case (AJA-245): a wish piece pinned into the look while
  // everything supporting it stays owned. `filterPool` strips wishlist items from the
  // candidate pool and `opts.anchor` is placed directly, so this needs nothing from
  // matching.ts — and Surprise me with no anchor is unchanged, owned-only.
  const buildLook = (anchor?: WardrobeItem): boolean => {
    const owned = trayItems.filter((it) => !it.wishlist && it.imageUrl);
    // AJA-248. This used to pass `{}` — with no options, four of the six weights
    // in scoreLook are frozen constants (weather 0.7, vibe 0.65, semantic 0.55,
    // taste 0.5) and only antiRepeat varies, which is why Surprise me was
    // statistically indistinguishable from random. Weather is already cached and
    // free; the vibe/occasion come from the onboarding quiz that Settings
    // already advertises as tuning "Generate outfit".
    const weather = readCachedWeather();
    const ids =
      bestLook(owned, {
        ...(anchor ? { anchor } : {}),
        ...(engineV2 ? { engine: "v2" as const } : {}),
        weather: weather
          ? {
              season: weather.season,
              needsOuterwear: weather.needsOuterwear,
              tempC: weather.tempC ?? undefined,
            }
          : null,
        season: weather?.season,
        vibe: primaryStyleVibe(profile) || undefined,
        occasion: profile.styleOccasions?.[0],
        taste: readTaste(),
      })?.itemIds ?? [];
    const pool = anchor ? [anchor, ...owned] : owned;
    const picks = ids
      .map((id) => pool.find((it) => it.id === id))
      .filter((it): it is WardrobeItem => !!it);
    if (picks.length === 0) return false;
    // Styled collage (AJA-232): top + bottom on the LEFT as the HERO (biggest), outerwear +
    // accessories on the RIGHT (smaller supports), shoes bottom-right. Bucketed by slot, placed in
    // board pixels + clamped. Hero is capped by height too so two stack cleanly on 3:4 AND 1:1.
    const bw = board.w || 260;
    const bh = board.h || 340;
    const HERO = Math.round(Math.min(bw * 0.52, bh * 0.42));
    const OUTER = Math.round(Math.min(bw * 0.4, bh * 0.3));
    const SHOE = Math.round(bw * 0.36);
    const ACC = Math.round(bw * 0.28);
    const leftX = Math.round(bw * 0.03);
    const leftCx = leftX + HERO / 2; // left-column centre-x; hero pieces are centred on it
    const rCx = bw * 0.74; // right-column centre-x; right pieces are centred on it
    const bySlot: Partial<Record<string, WardrobeItem[]>> = {};
    for (const it of picks) (bySlot[slotForCategory(it.category)] ??= []).push(it);
    const next: CanvasItem[] = [];
    let z = 0;
    const clampN = (v: number, hi: number) => Math.max(0, Math.min(Math.round(v), hi));
    const put = (it: WardrobeItem, x: number, y: number, size: number) => {
      next.push({
        id: uid(),
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
    const putR = (it: WardrobeItem, y: number, size: number) => put(it, rCx - size / 2, y, size);
    const putL = (it: WardrobeItem, y: number, size: number) => put(it, leftCx - size / 2, y, size);
    // LEFT — hero pieces (big), all centred on leftCx so top + bottom line up vertically
    if (bySlot.dress?.length) {
      putL(bySlot.dress[0], bh * 0.14, HERO); // dress owns the left column
    } else {
      if (bySlot.top?.length) putL(bySlot.top[0], bh * 0.06, HERO);
      // Pants read narrow, so give them a slightly bigger box to feel proportionate to the top.
      if (bySlot.bottom?.length) putL(bySlot.bottom[0], bh * 0.5, Math.round(HERO * 1.12));
    }
    // RIGHT — supports stacked from the top, centred on rCx; shoes pinned bottom-right
    let ry = bh * 0.06;
    if (bySlot.outerwear?.length) {
      putR(bySlot.outerwear[0], ry, OUTER);
      ry += OUTER + bh * 0.04;
    }
    (bySlot.accessories ?? []).slice(0, 1).forEach((it) => putR(it, ry, ACC));
    if (bySlot.shoes?.length) putR(bySlot.shoes[0], bh * 0.7, SHOE);
    replaceNodes(next);
    return true;
  };

  const surpriseLook = () => {
    setSelectedId(null);
    flash(buildLook() ? "Here's a look — tweak it" : "Add clothes to your closet first");
  };

  // "Style it" from a wishlist card (AJA-245). The queue carries only the id, because
  // laying the look out needs the measured board — so wait for the first measurement,
  // then consume it once. Never in a shared session: that board isn't yours.
  const pendingStyleItemId = useWardrobe((s) => s.pendingStyleItemId);
  const clearPendingStyleItem = useWardrobe((s) => s.clearPendingStyleItem);
  useEffect(() => {
    if (collab || !pendingStyleItemId || !board.w) return;
    const anchor = trayItems.find((it) => it.id === pendingStyleItemId);
    clearPendingStyleItem();
    if (anchor) buildLook(anchor);
    // buildLook is re-created every render; re-runs are harmless because the queue is
    // cleared above, and the guard makes every later pass a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab, pendingStyleItemId, board.w, trayItems, clearPendingStyleItem]);
  const addText = () => {
    const t = textInput.trim();
    if (!t) return;
    if (collab) setSelectedId(collab.addText(t, textColor));
    else {
      addCanvasText(t, textColor);
      selectLast();
    }
    setTextInput("");
    flash("Text added");
  };
  const addSticker = (emoji: string) => {
    if (collab) setSelectedId(collab.addSticker(emoji));
    else {
      addCanvasSticker(emoji);
      selectLast();
    }
  };

  const close = () => {
    setSelectedId(null);
    if (collab) collab.onClose();
    else setView("outfits");
  };

  const doSave = () => {
    const ids = [...new Set(nodes.filter((c) => c.itemId).map((c) => c.itemId as string))];
    if (nodes.length === 0) return;
    const name = saveName.trim() || `Look · ${new Date().toLocaleDateString("en-US")}`;
    if (collab) {
      collab.onSave(name);
      setSaving(false);
      setSaveName("");
      return;
    }
    // Persist the full board layout (positions/sizes/rotation/z + text/stickers + bg),
    // not just the item ids, so the board restores exactly on reopen.
    saveOutfit(name, "", ids, nodes, canvasBg);
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
  // Space the sheet currently occupies (floored to BOARD_RESERVE). The full board corresponds to
  // BOARD_RESERVE; as the sheet rises, scale the WHOLE board (pieces included) down to fit above it.
  const boardReserve = Math.max(BOARD_RESERVE, maxOffset + PEEK - offset);
  const boardScale = board.h
    ? Math.max(0.35, Math.min(1, (board.h + BOARD_RESERVE - boardReserve) / board.h))
    : 1;

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
        <div className="min-w-0 px-2 text-center">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {collab ? collab.title : "New look"}
          </p>
          <p className="truncate text-[11px] text-muted">
            {collab
              ? collab.subtitle
              : nodes.length === 0
                ? "No pieces yet"
                : `${nodes.length} ${nodes.length === 1 ? "piece" : "pieces"}`}
          </p>
        </div>
        {collab && !collab.canSave ? (
          // The friend can't write to someone else's closet, and saying so beats a
          // button that silently does nothing.
          <span className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-[11px] text-muted">
            <Lock size={12} /> They save
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setSaving(true)}
            disabled={nodes.length === 0}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors active:scale-95 ${
              nodes.length === 0
                ? "bg-surface-2 text-muted"
                : "bg-accent text-accent-foreground"
            }`}
          >
            {collab ? collab.saveLabel : "Next"}
          </button>
        )}
      </div>

      {/* board area — the canonical full board is top-anchored and reserves a fixed strip below for
          the collapsed sheet + toolbar; the board itself is CSS-scaled (below) to fit the sheet. */}
      <div
        ref={areaRef}
        className="relative min-h-0 flex-1"
        style={{ paddingBottom: `${BOARD_RESERVE}px` }}
      >
        {collab && (
          <button
            type="button"
            onClick={collab.onEnd}
            className="absolute left-5 top-2 z-30 rounded-full border border-red-200 bg-surface/95 px-3 py-1 text-[12px] font-semibold text-red-600 backdrop-blur-sm active:scale-95"
          >
            End session
          </button>
        )}

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

        {/* Selected-item controls — a fixed strip on the right edge (not over the item), shown while
            a piece is selected; predictable spot instead of a popup that jumps above the piece. */}
        {selectedId &&
          (() => {
            const sc = nodes.find((x) => x.id === selectedId);
            if (!sc) return null;
            const b =
              "flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-foreground shadow-md backdrop-blur-sm transition-transform active:scale-90";
            return (
              <div className="animate-pop absolute right-2.5 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2">
                {sc.kind !== "text" && (
                  <button type="button" aria-label="Flip" className={b} onClick={() => updateNode(sc.id, { flipped: !sc.flipped })}>
                    <FlipHorizontal size={17} />
                  </button>
                )}
                <button type="button" aria-label="Duplicate" className={b} onClick={() => duplicatePiece(sc.id)}>
                  <Copy size={17} />
                </button>
                <button type="button" aria-label="Bring to front" className={b} onClick={() => bringToFront(sc.id)}>
                  <ArrowUp size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Delete"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-md backdrop-blur-sm transition-transform active:scale-90"
                  onClick={() => deletePiece(sc.id)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            );
          })()}

        <div className="flex h-full items-start justify-center px-3 pt-1">
          <div
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
            className="relative overflow-hidden rounded-3xl border border-line touch-none"
            style={{
              width: board.w || undefined,
              height: board.h || undefined,
              background: bg || "#ffffff",
              transform: `scale(${boardScale})`,
              transformOrigin: "top center",
              transition: dragging ? "none" : "transform 260ms cubic-bezier(0.22,1,0.36,1)",
            }}
          >
          {nodes.length === 0 && (
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

          {nodes.map((c) => {
            let content: React.ReactNode;
            let wish = false;
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
              const item = trayItems.find((i) => i.id === c.itemId);
              if (!item) return null;
              wish = item.wishlist;
              content = (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  draggable={false}
                  className="pointer-events-none h-full w-full object-contain"
                  style={{
                    transform: c.flipped ? "scaleX(-1)" : "scaleX(1)",
                    // Four zero-blur shadows trace the cutout's own alpha edge, so the
                    // marker follows the garment's silhouette. A dashed box around a
                    // narrow coat reads as a loose empty rectangle (AJA-245).
                    filter: wish ? WISH_OUTLINE : undefined,
                  }}
                />
              );
            }

            const held = collab?.heldByThem?.pieceId === c.id ? collab.heldByThem : null;
            return (
              <CanvasPiece
                key={c.id}
                c={c}
                board={board}
                scale={boardScale}
                selected={selectedId === c.id}
                onSelect={select}
                onCommit={updateNode}
                onRemove={deletePiece}
                trashRef={trashRef}
                onGrab={collab?.onGrab}
                onRelease={collab?.onRelease}
              >
                <div className="relative h-full w-full">
                  {content}
                  {wish && (
                    <span className="pointer-events-none absolute left-0 top-0 rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
                      Wish
                    </span>
                  )}
                  {held && (
                    // Two broadcast events per gesture is what makes commit-level sync
                    // read as live instead of pieces teleporting with no explanation.
                    <span className="pointer-events-none absolute -inset-2 rounded-xl border-[1.5px] border-amber-500">
                      <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {held.name}
                      </span>
                    </span>
                  )}
                </div>
              </CanvasPiece>
            );
          })}

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

        {/* editor toolbar — labelled tools with a sliding highlight; collapses into a side "ball"
            (tap to reopen) so it's out of the way while arranging. Rides above the sheet. */}
        <div
          className={`pointer-events-none absolute inset-x-0 z-40 flex px-4 ${toolbarOpen ? "justify-center" : "justify-end"}`}
          style={{
            bottom: `calc(${reserveCss} + 26px)`,
            transition: dragging ? "none" : "bottom 260ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          {toolbarOpen ? (
            <div className="animate-pop pointer-events-auto relative flex items-center gap-1 rounded-[22px] border border-line bg-white/95 p-1 shadow-lg backdrop-blur-sm">
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
              <button
                type="button"
                aria-label="Hide tools"
                onClick={() => setToolbarOpen(false)}
                className="relative z-[1] ml-0.5 flex h-12 w-7 items-center justify-center rounded-2xl text-muted transition-transform active:scale-90"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-label="Show tools"
              onClick={() => setToolbarOpen(true)}
              className="animate-pop pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white/95 text-accent shadow-lg backdrop-blur-sm transition-transform active:scale-90"
            >
              <LayoutGrid size={20} />
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
              <div className="flex items-center justify-between px-4 pb-3">
                <p className="text-[13px] text-muted">
                  Your closet · {ownedCount} {ownedCount === 1 ? "piece" : "pieces"}
                  {wishCount > 0 && (
                    <span className="text-amber-700/80"> · {wishCount} to buy</span>
                  )}
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
                        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                          <PieceThumb item={item} />
                          {item.wishlist && (
                            <span className="absolute left-1 top-1 rounded-full bg-amber-500/90 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white">
                              Wish
                            </span>
                          )}
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
                  onClick={() => setBgFn(null)}
                  className={`flex aspect-square items-center justify-center rounded-xl border bg-white text-xs text-muted ${!bg ? "border-accent ring-1 ring-accent" : "border-line"}`}
                >
                  None
                </button>
                {[...BG_SOLIDS, ...BG_GRADIENTS].map((swatch) => (
                  <button
                    key={swatch}
                    onClick={() => setBgFn(swatch)}
                    style={{ background: swatch }}
                    className={`aspect-square rounded-xl border ${bg === swatch ? "border-accent ring-1 ring-accent" : "border-line"}`}
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
