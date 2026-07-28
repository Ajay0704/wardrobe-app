"use client";

import {
  ArrowUp,
  ChevronLeft,
  FlipHorizontal,
  Lock,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canvasToPiece,
  endSession,
  getSession,
  listPieces,
  listSessionItems,
  markSaved,
  pieceToCanvas,
  removePiece,
  setBoardSettings,
  subscribeGrabs,
  subscribeSession,
  syncSessionItems,
  upsertPiece,
  type Grab,
  type StylingPiece,
  type StylingSession,
  type StylingSessionItem,
} from "@/lib/styling";
import { profileHandle } from "@/lib/profile";
import { uid, useWardrobe } from "@/lib/store";
import type { CanvasItem } from "@/lib/types";
import { CanvasPiece } from "../CanvasPiece";
import { ProfileAvatar } from "../ProfileAvatar";

/**
 * The live shared board (AJA-240). Two people, one composition.
 *
 * Sync is COMMIT-LEVEL: the piece follows your finger locally and one row is written
 * when you let go. Streaming coordinates would mean a write per animation frame on a
 * board where every gesture end already serializes the whole store to localStorage.
 * What makes it feel live instead of teleporty is the grab/release presence signal —
 * two broadcast events per gesture, no database writes.
 *
 * Remote changes are deliberately IGNORED while your finger is down and applied on
 * release. Combined with CanvasPiece freezing its geometry at gesture start, that
 * removes the whole class of mid-drag rebasing bugs.
 */
/**
 * Collapsed tray peek, and the strip the board keeps clear beneath itself for the
 * trash zone. Mirrors the solo builder (PEEK / BOARD_RESERVE) so the two canvases
 * feel like the same tool.
 */
const TRAY_PEEK = 78;
const TRAY_OPEN = 244;
const BOARD_RESERVE = TRAY_PEEK + 76;

export function StyleSessionView() {
  const sessionId = useWardrobe((s) => s.styleSessionId);
  const setView = useWardrobe((s) => s.setView);
  const authUser = useWardrobe((s) => s.authUser);
  const profile = useWardrobe((s) => s.profile);
  const items = useWardrobe((s) => s.items);
  const saveOutfit = useWardrobe((s) => s.saveOutfit);
  const outfits = useWardrobe((s) => s.outfits);
  const myId = authUser?.id ?? null;

  const [session, setSession] = useState<StylingSession | null>(null);
  const [closet, setCloset] = useState<StylingSessionItem[]>([]);
  const [wire, setWire] = useState<StylingPiece[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grab, setGrab] = useState<Grab | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [trayOpen, setTrayOpen] = useState(true);

  const trashRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const sendGrabRef = useRef<((g: Grab) => void) | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const iAmOwner = !!session && session.ownerId === myId;
  const them = session ? (iAmOwner ? session.stylist : session.owner) : null;
  const live = session?.status === "active";

  /* ------------------------------------------------------------- board size */
  const [boxW, setBoxW] = useState(0);
  const [boxH, setBoxH] = useState(0);
  // A CALLBACK ref, not useEffect + areaRef. The first render returns the `loading`
  // branch, so a mount-effect with [] deps runs while the board element doesn't exist
  // yet, finds a null ref, and never observes anything — leaving board.w at 0 and the
  // board rendered with zero height. This runs the moment the node actually mounts.
  const roRef = useRef<ResizeObserver | null>(null);
  const attachArea = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    // observe() fires an initial callback, so the first size arrives without priming.
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setBoxW(r.width);
      setBoxH(r.height);
    });
    ro.observe(el);
    roRef.current = ro;
  }, []);

  // The board shape comes from the SESSION, not local state, so both phones agree.
  // Contain-fit the CANONICAL board (tray collapsed) into the stage: fill the height
  // first, fall back to width. This is what makes the canvas big — it now claims the
  // whole screen instead of whatever a vertical stack of controls left over.
  const board = useMemo(() => {
    const ratio = session?.aspect === "1:1" ? 1 : 3 / 4; // w / h
    const availW = Math.max(0, boxW - 20);
    const availH = Math.max(0, boxH - BOARD_RESERVE);
    if (availW <= 0 || availH <= 0) return { w: 0, h: 0 };
    let h = availH;
    let w = h * ratio;
    if (w > availW) {
      w = availW;
      h = w / ratio;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [boxW, boxH, session?.aspect]);

  // Opening the tray doesn't resize the board, it SCALES it — pieces scale with it, so
  // the composition never reflows under you (the AJA-232 lesson from the solo builder).
  const boardScale = useMemo(() => {
    if (!board.h || !trayOpen) return 1;
    const extra = TRAY_OPEN - TRAY_PEEK;
    return Math.max(0.45, Math.min(1, (board.h - extra) / board.h));
  }, [board.h, trayOpen]);

  const canvas = useMemo(
    () => (board.w > 0 ? wire.map((p) => pieceToCanvas(p, board)) : []),
    [wire, board],
  );
  const byRef = useMemo(() => {
    const m = new Map<string, StylingSessionItem>();
    for (const it of closet) m.set(it.itemRef, it);
    return m;
  }, [closet]);

  /* ------------------------------------------------------------------ load */
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    (async () => {
      try {
        const [s, its, ps] = await Promise.all([
          getSession(sessionId),
          listSessionItems(sessionId),
          listPieces(sessionId),
        ]);
        if (!alive) return;
        setSession(s);
        setCloset(its);
        setWire(ps);
      } catch {
        /* ended or revoked — the guard below renders the right thing */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, tick]);

  // The owner refreshes their snapshot on entry, so anything added between asking
  // and the friend accepting is on the board's shelf too.
  useEffect(() => {
    if (!sessionId || !iAmOwner || !live) return;
    let alive = true;
    (async () => {
      try {
        await syncSessionItems(sessionId, items);
        const its = await listSessionItems(sessionId);
        if (alive) setCloset(its);
      } catch {
        /* non-fatal — they just see the snapshot from when they asked */
      }
    })();
    return () => {
      alive = false;
    };
    // Deliberately not keyed on `items`: this is an on-entry sync, not a live mirror.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, iAmOwner, live]);

  /* -------------------------------------------------------------- realtime */
  useEffect(() => {
    if (!sessionId) return;
    // Remote changes that land mid-gesture are deferred, not dropped: applying one
    // while a finger is down would yank the piece out from under it.
    return subscribeSession(sessionId, () => {
      if (heldRef.current) {
        pendingRef.current = true;
        return;
      }
      refresh();
    });
  }, [sessionId, refresh]);

  useEffect(() => {
    if (!sessionId) return;
    const ch = subscribeGrabs(sessionId, (g) => setGrab(g.pieceId ? g : null));
    sendGrabRef.current = ch.send;
    return () => {
      sendGrabRef.current = null;
      ch.leave();
    };
  }, [sessionId]);

  /* --------------------------------------------------------------- editing */
  const myName = profile.displayName || profileHandle(profile) || "Someone";

  const onGrab = (id: string) => {
    heldRef.current = id;
    sendGrabRef.current?.({ pieceId: id, by: myId ?? "", name: myName });
  };
  const onRelease = (id: string) => {
    if (heldRef.current === id) heldRef.current = null;
    sendGrabRef.current?.({ pieceId: null, by: myId ?? "", name: myName });
    if (pendingRef.current) {
      pendingRef.current = false;
      refresh();
    }
  };

  const commit = (id: string, patch: Partial<CanvasItem>) => {
    if (!sessionId || board.w === 0) return;
    // Reads `wire` from this render's closure rather than a ref: commit only runs
    // from gesture handlers, and remote updates are deferred while a finger is down,
    // so it can't be stale here.
    const current = wire.find((p) => p.pieceId === id);
    if (!current) return;
    const merged: CanvasItem = { ...pieceToCanvas(current, board), ...patch };
    const next = canvasToPiece(merged, board);
    setWire((prev) =>
      prev.map((p) => (p.pieceId === id ? { ...p, ...next } : p)),
    );
    void upsertPiece(sessionId, next).catch(() => flash("Couldn't save that move"));
  };

  const topZ = () => wire.reduce((m, p) => Math.max(m, p.zIndex), 0);

  const addPiece = (itemRef: string) => {
    if (!sessionId || board.w === 0) return;
    const size = Math.round(board.w * 0.42);
    const item: CanvasItem = {
      id: uid(), // client-unique; two people can add in the same millisecond
      kind: "item",
      itemId: itemRef,
      x: Math.round(board.w * 0.29),
      y: Math.round(board.h * 0.22),
      width: size,
      height: size,
      rotation: 0,
      zIndex: topZ() + 1,
      flipped: false,
    };
    const next = canvasToPiece(item, board);
    setWire((prev) => [...prev, { ...next, updatedBy: myId, updatedAt: "" }]);
    setSelectedId(item.id);
    void upsertPiece(sessionId, next).catch(() => flash("Couldn't add that"));
  };

  const drop = (id: string) => {
    if (!sessionId) return;
    setWire((prev) => prev.filter((p) => p.pieceId !== id));
    if (selectedId === id) setSelectedId(null);
    void removePiece(sessionId, id).catch(() => flash("Couldn't remove that"));
  };

  const setAspect = (aspect: string) => {
    if (!sessionId || !session) return;
    setSession({ ...session, aspect });
    void setBoardSettings(sessionId, { aspect }).catch(() => {});
  };

  const finish = async () => {
    if (!sessionId) return;
    try {
      await endSession(sessionId);
    } catch {
      /* already ended */
    }
    setView("outfits");
  };

  const save = () => {
    if (!sessionId || !iAmOwner || canvas.length === 0) return;
    const ids = [...new Set(canvas.filter((c) => c.itemId).map((c) => c.itemId as string))];
    const name = them?.name ? `Styled by ${them.name}` : "Styled with a friend";
    saveOutfit(name, "", ids, canvas, session?.canvasBg ?? null);
    // saveOutfit prepends, so the new outfit is the head of the list.
    const savedId = useWardrobe.getState().outfits[0]?.id;
    if (savedId) void markSaved(sessionId, savedId).catch(() => {});
    flash("Saved to your outfits");
  };

  const savedAlready = !!session?.savedOutfitId &&
    outfits.some((o) => o.id === session.savedOutfitId);

  /* ----------------------------------------------------------------- views */
  if (!sessionId) {
    return <Empty title="No session open" body="Pick a styling session from Outfits." onBack={() => setView("outfits")} />;
  }
  if (loading) {
    return <p className="py-16 text-center text-sm text-muted">Opening the board…</p>;
  }
  if (!session) {
    return <Empty title="Session not found" body="It may have been ended." onBack={() => setView("outfits")} />;
  }
  if (!live) {
    return (
      <Empty
        title="Session ended"
        body={
          iAmOwner
            ? `${them?.name || "Your friend"} no longer has access to your closet.`
            : "You can't see their closet any more."
        }
        onBack={() => setView("outfits")}
      />
    );
  }

  const selected = canvas.find((c) => c.id === selectedId) ?? null;

  return (
    // Full-screen, like the solo builder. Living inside the padded, scrolling shell
    // (with the tab bar below) is what made the board tiny.
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setView("outfits")}
          className="flex h-9 items-center gap-0.5 rounded-full px-2 text-sm text-accent active:scale-95"
        >
          <ChevronLeft size={20} /> Outfits
        </button>
        {iAmOwner ? (
          <button
            type="button"
            onClick={save}
            disabled={canvas.length === 0}
            className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors active:scale-95 ${
              canvas.length === 0
                ? "bg-surface-2 text-muted"
                : "bg-accent text-accent-foreground"
            }`}
          >
            <Save size={15} /> {savedAlready ? "Save again" : "Save"}
          </button>
        ) : (
          <span className="flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-xs text-muted">
            <Lock size={13} /> {session.owner.name || "They"} saves
          </span>
        )}
      </div>

      {/* board stage — reserves a strip for the collapsed tray + trash */}
      <div
        ref={attachArea}
        className="relative min-h-0 flex-1"
        style={{ paddingBottom: `${BOARD_RESERVE}px` }}
      >
        {/* Live pill — translucent chrome floating over the canvas rather than a
            solid bar eating a row of height. */}
        <div className="pointer-events-none absolute left-3 right-3 top-1 z-30 flex items-center gap-2">
          <div className="pointer-events-auto flex max-w-[68%] items-center gap-2 rounded-full border border-accent/30 bg-accent-soft/85 py-1 pl-1 pr-3 backdrop-blur-md">
            <ProfileAvatar
              profile={{ displayName: them?.name ?? "", avatarUrl: them?.avatar }}
              size={22}
            />
            <span className="truncate text-[11.5px] font-medium">
              {iAmOwner
                ? `${them?.name || "Your friend"} is styling you`
                : `Styling ${them?.name || "them"}`}
            </span>
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
          </div>
          <div className="flex-1" />
          <div className="pointer-events-auto flex overflow-hidden rounded-full border border-line bg-surface/90 backdrop-blur-md">
            {(["3:4", "1:1"] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={session.aspect === a}
                onClick={() => setAspect(a)}
                className={`px-2.5 py-1 text-[11.5px] font-medium transition-colors active:scale-95 ${
                  session.aspect === a ? "bg-accent text-accent-foreground" : "text-muted"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={finish}
            className="pointer-events-auto rounded-full border border-red-200 bg-surface/90 px-3 py-1 text-[11.5px] font-semibold text-red-600 backdrop-blur-md active:scale-95"
          >
            End
          </button>
        </div>

        {/* the board itself */}
        <div
          className="mx-auto overflow-hidden rounded-2xl border border-line shadow-sm"
          style={{
            width: board.w || undefined,
            height: board.h || undefined,
            background: session.canvasBg || "#ffffff",
            touchAction: "none",
            position: "relative",
            transform: `scale(${boardScale})`,
            transformOrigin: "top center",
            transition: "transform 0.32s cubic-bezier(0.22,1,0.36,1)",
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {canvas.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-sm font-medium">Nothing on the board yet</p>
              <p className="text-xs text-muted">
                Tap pieces below — you&apos;ll both see them appear.
              </p>
            </div>
          )}
          {canvas.map((c) => {
            const it = c.itemId ? byRef.get(c.itemId) : undefined;
            const heldByThem = grab?.pieceId === c.id && grab.by !== myId;
            return (
              <CanvasPiece
                key={c.id}
                c={c}
                board={board}
                scale={boardScale}
                selected={c.id === selectedId}
                trashRef={trashRef}
                onSelect={setSelectedId} // NB: no z-bump — concurrent drags would z-fight
                onCommit={commit}
                onRemove={drop}
                onGrab={onGrab}
                onRelease={onRelease}
              >
                <div className="relative h-full w-full">
                  {it?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.imageUrl}
                      alt={it.name ?? ""}
                      className="h-full w-full object-contain"
                      style={{ transform: c.flipped ? "scaleX(-1)" : undefined }}
                    />
                  ) : (
                    <span
                      className="block h-full w-full rounded-xl"
                      style={{ background: it?.color ?? "#d6d3d1" }}
                    />
                  )}
                  {heldByThem && (
                    <span className="pointer-events-none absolute -inset-2 rounded-xl border-[1.5px] border-amber-500">
                      <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {grab?.name || "Them"}
                      </span>
                    </span>
                  )}
                </div>
              </CanvasPiece>
            );
          })}
        </div>

        {/* Selected-piece controls — a fixed strip on the right edge, same place every
            time, rather than a popup that jumps around with the piece. */}
        {selected && (
          <div className="animate-pop absolute right-2.5 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2">
            <IconBtn
              label="Bring to front"
              icon={ArrowUp}
              onClick={() => commit(selected.id, { zIndex: topZ() + 1 })}
            />
            <IconBtn
              label="Flip"
              icon={FlipHorizontal}
              onClick={() => commit(selected.id, { flipped: !selected.flipped })}
            />
            <IconBtn label="Remove" icon={Trash2} danger onClick={() => drop(selected.id)} />
          </div>
        )}

        {/* drag-to-delete target */}
        <div
          ref={trashRef}
          className="pointer-events-none absolute left-1/2 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 text-red-500"
          style={{
            bottom: `${TRAY_PEEK + 12}px`,
            opacity: 0,
            transform: "translateX(-50%) translateY(20px)",
            background: "rgba(239,68,68,0.10)",
            borderColor: "rgba(248,113,113,0.6)",
            transition: "all .16s cubic-bezier(.22,1,.36,1)",
          }}
        >
          <Trash2 size={20} />
        </div>

        {toast && (
          <p className="absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full bg-foreground/90 px-4 py-2 text-xs text-background backdrop-blur-sm">
            {toast}
          </p>
        )}
      </div>

      {/* tray — collapses to a peek so the board can own the screen */}
      <div
        className="absolute inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-line bg-surface shadow-[0_-10px_40px_rgba(0,0,0,0.12)]"
        style={{
          height: TRAY_OPEN,
          transform: `translateY(${trayOpen ? 0 : TRAY_OPEN - TRAY_PEEK}px)`,
          transition: "transform 0.32s cubic-bezier(0.22,1,0.36,1)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <button
          type="button"
          onClick={() => setTrayOpen((v) => !v)}
          aria-expanded={trayOpen}
          className="flex w-full flex-col items-center gap-1.5 pb-1 pt-2.5"
        >
          <span className="h-1 w-9 rounded-full bg-line" />
          <span className="flex w-full items-baseline gap-1.5 px-4 text-left">
            <span className="text-[13px] font-semibold">
              {iAmOwner ? "Your closet" : `${them?.name || "Their"} closet`}
            </span>
            <span className="text-[11.5px] text-muted">· {closet.length} pieces</span>
            <span className="flex-1" />
            <span className="text-[11.5px] font-medium text-accent">
              {trayOpen ? "Hide" : "Show"}
            </span>
          </span>
        </button>

        <div className="h-[calc(100%-56px)] overflow-y-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {closet.length === 0 ? (
            <p className="px-1 pt-2 text-xs text-muted">Nothing shared yet.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {closet.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => addPiece(it.itemRef)}
                  title={it.name ?? ""}
                  className="flex aspect-square items-center justify-center rounded-xl border border-line bg-surface-2 p-1.5 transition-transform active:scale-90"
                >
                  {it.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.imageUrl}
                      alt={it.name ?? ""}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span
                      className="h-8 w-8 rounded-lg"
                      style={{ background: it.color ?? "#d6d3d1" }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Trash2;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-md backdrop-blur-sm transition-transform active:scale-90 ${
        danger ? "text-red-600" : "text-foreground"
      }`}
    >
      <Icon size={17} />
    </button>
  );
}

function Empty({
  title,
  body,
  onBack,
}: {
  title: string;
  body: string;
  onBack: () => void;
}) {
  return (
    <div className="py-16 text-center">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Lock size={18} />
      </span>
      <h2 className="heading text-lg">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">{body}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 rounded-xl border border-line px-4 py-2 text-sm"
      >
        Back to Outfits
      </button>
    </div>
  );
}
