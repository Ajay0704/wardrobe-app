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
  const board = useMemo(() => {
    const ratio = session?.aspect === "1:1" ? 1 : 3 / 4; // w / h
    let w = boxW;
    let h = w / ratio;
    if (boxH > 0 && h > boxH) {
      h = boxH;
      w = h * ratio;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [boxW, boxH, session?.aspect]);

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
    <div className="flex h-full flex-col pb-4">
      <div className="-mx-4 mb-2 flex items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => setView("outfits")}
          className="flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-sm text-accent active:scale-95"
        >
          <ChevronLeft size={19} /> Outfits
        </button>
      </div>

      <div className="mb-2.5 flex items-center gap-2.5 rounded-2xl border border-accent/35 bg-accent-soft px-3 py-2.5">
        <ProfileAvatar profile={{ displayName: them?.name ?? "", avatarUrl: them?.avatar }} size={26} />
        <p className="min-w-0 flex-1 truncate text-xs">
          <span className="font-semibold">
            {iAmOwner ? `${them?.name || "Your friend"} is styling you` : `Styling ${them?.name || "them"}`}
          </span>{" "}
          · live
        </p>
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
        <button type="button" onClick={finish} className="text-xs font-semibold text-red-600">
          End
        </button>
      </div>

      <div ref={attachArea} className="relative min-h-0 flex-1">
        <div
          className="relative mx-auto overflow-hidden rounded-2xl border border-line"
          style={{
            width: board.w || undefined,
            height: board.h || undefined,
            background: session.canvasBg || "#ffffff",
            touchAction: "none",
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
                scale={1}
                selected={c.id === selectedId}
                trashRef={trashRef}
                onSelect={setSelectedId} // NB: no z-bump here — concurrent drags would z-fight
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

        <div
          ref={trashRef}
          className="pointer-events-none absolute bottom-3 left-1/2 flex h-12 w-12 items-center justify-center rounded-full border-2 text-red-500"
          style={{
            opacity: 0,
            transform: "translateX(-50%) translateY(20px)",
            background: "rgba(239,68,68,0.10)",
            borderColor: "rgba(248,113,113,0.6)",
            transition: "all .16s cubic-bezier(.22,1,.36,1)",
          }}
        >
          <Trash2 size={20} />
        </div>
      </div>

      {toast && (
        <p className="mt-2 rounded-xl border border-line bg-surface px-3 py-2 text-center text-sm">
          {toast}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted">
          {grab?.pieceId && grab.by !== myId
            ? `${grab.name} is moving a piece`
            : "Both of you see every change."}
        </p>
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {(["3:4", "1:1"] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={session.aspect === a}
              onClick={() => setAspect(a)}
              className={`rounded-lg px-2.5 py-1 text-xs ${
                session.aspect === a ? "bg-surface font-semibold shadow-sm" : "text-muted"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="mt-2 flex gap-2">
          <Tool icon={ArrowUp} label="Front" onClick={() => commit(selected.id, { zIndex: topZ() + 1 })} />
          <Tool icon={FlipHorizontal} label="Flip" onClick={() => commit(selected.id, { flipped: !selected.flipped })} />
          <Tool icon={Trash2} label="Remove" danger onClick={() => drop(selected.id)} />
        </div>
      )}

      <div className="mt-3 rounded-2xl border border-line bg-surface p-2.5">
        <p className="mb-2 px-1 text-xs">
          <span className="font-semibold">{iAmOwner ? "Your closet" : `${them?.name || "Their"} closet`}</span>
          <span className="text-muted">
            {" "}· {closet.length} pieces{iAmOwner ? "" : " · shared for this session"}
          </span>
        </p>
        {closet.length === 0 ? (
          <p className="px-1 pb-1 text-xs text-muted">Nothing shared yet.</p>
        ) : (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {closet.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => addPiece(it.itemRef)}
                title={it.name ?? ""}
                className="flex h-[76px] w-16 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 p-1.5 active:scale-95"
              >
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt={it.name ?? ""} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="h-8 w-8 rounded-lg" style={{ background: it.color ?? "#d6d3d1" }} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        {iAmOwner ? (
          <button
            type="button"
            onClick={save}
            disabled={canvas.length === 0}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground active:scale-[0.98] disabled:opacity-45"
          >
            <Save size={16} /> {savedAlready ? "Save again" : "Save to my outfits"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm text-muted"
          >
            <Lock size={16} /> Only {session.owner.name || "they"} can save this look
          </button>
        )}
        <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
          {iAmOwner
            ? `${them?.name || "They"} can build and rearrange, but the look only lands in your closet when you save it.`
            : `${session.owner.name || "They"} saves the look. You'll see it land.`}
        </p>
      </div>
    </div>
  );
}

function Tool({
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
      onClick={onClick}
      className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-xs active:scale-95 ${
        danger ? "border-red-200 bg-surface text-red-600" : "border-line bg-surface"
      }`}
    >
      <Icon size={15} /> {label}
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
