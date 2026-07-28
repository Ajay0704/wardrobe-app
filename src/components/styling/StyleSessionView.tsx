"use client";

import { Lock } from "lucide-react";
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
  replaceBoard,
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
import type { CanvasItem, Category, WardrobeItem } from "@/lib/types";
import { CanvasBuilderView, type CollabCanvas } from "../CanvasBuilderView";

/**
 * The live shared board (AJA-240) — an ADAPTER, not a second canvas.
 *
 * It owns the session data (pieces, shared board settings, presence) and hands it to
 * the real CanvasBuilderView through the `collab` contract. That's deliberate: the
 * first cut was a hand-rolled lookalike with a cramped board and none of the builder's
 * tools, and every future canvas change would have had to be made twice.
 *
 * Sync is COMMIT-LEVEL — the piece follows your finger locally and one row is written
 * when you let go. Streaming coordinates would be a write per animation frame. The
 * grab/release broadcast is what makes that read as live rather than teleporty.
 *
 * The builder is a pixel canvas; the wire format is 0..1 fractions, so two phones with
 * different screens compose on the same board.
 */
export function StyleSessionView() {
  const sessionId = useWardrobe((s) => s.styleSessionId);
  const setView = useWardrobe((s) => s.setView);
  const authUser = useWardrobe((s) => s.authUser);
  const profile = useWardrobe((s) => s.profile);
  const items = useWardrobe((s) => s.items);
  const saveOutfit = useWardrobe((s) => s.saveOutfit);
  const myId = authUser?.id ?? null;

  const [session, setSession] = useState<StylingSession | null>(null);
  const [closet, setCloset] = useState<StylingSessionItem[]>([]);
  const [wire, setWire] = useState<StylingPiece[]>([]);
  const [grab, setGrab] = useState<Grab | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const heldRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const sendGrabRef = useRef<((g: Grab) => void) | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const iAmOwner = !!session && session.ownerId === myId;
  const them = session ? (iAmOwner ? session.stylist : session.owner) : null;
  const live = session?.status === "active";

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
        /* ended or revoked — the guards below render the right thing */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, tick]);

  // The owner refreshes their snapshot on entry, so anything added between asking and
  // the friend accepting is on the shelf too.
  useEffect(() => {
    if (!sessionId || !iAmOwner || !live) return;
    let alive = true;
    (async () => {
      try {
        await syncSessionItems(sessionId, items);
        const its = await listSessionItems(sessionId);
        if (alive) setCloset(its);
      } catch {
        /* non-fatal — they see the snapshot from when they asked */
      }
    })();
    return () => {
      alive = false;
    };
    // On-entry sync, not a live mirror, so deliberately not keyed on `items`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, iAmOwner, live]);

  /* -------------------------------------------------------------- realtime */
  useEffect(() => {
    if (!sessionId) return;
    // Deferred, not dropped: applying a remote change while a finger is down would
    // yank the piece out from under it.
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

  /* ------------------------------------------------ session -> canvas shape */
  // A fixed canonical board; the builder scales it to the screen. Any size works as
  // long as both phones agree, because the wire format is fractional — 1000 keeps
  // integer rounding negligible.
  const BOARD = useMemo(() => ({ w: 1000, h: 1000 }), []);

  const nodes = useMemo(() => wire.map((p) => pieceToCanvas(p, BOARD)), [wire, BOARD]);

  // The session closet shaped as wardrobe items, so the builder's tray, category tabs
  // and sub-category chips all work untouched.
  const trayItems = useMemo<WardrobeItem[]>(
    () =>
      closet.map((it) => ({
        id: it.itemRef,
        name: it.name ?? "",
        imageUrl: it.imageUrl ?? "",
        category: (it.category ?? "top") as Category,
        subcategory: it.subcategory ?? undefined,
        color: it.color ?? "#a8a29e",
        brand: it.brand ?? undefined,
        tags: [],
        seasons: [],
        wishlist: false,
        favorite: false,
        createdAt: 0,
      })),
    [closet],
  );

  const put = useCallback(
    (c: CanvasItem) => {
      const next = canvasToPiece(c, BOARD);
      setWire((prev) =>
        prev.some((p) => p.pieceId === c.id)
          ? prev.map((p) => (p.pieceId === c.id ? { ...p, ...next } : p))
          : [...prev, { ...next, updatedBy: myId, updatedAt: "" }],
      );
      if (sessionId) void upsertPiece(sessionId, next).catch(() => {});
      return c.id;
    },
    [BOARD, myId, sessionId],
  );

  const collab = useMemo<CollabCanvas | null>(() => {
    if (!session || !live) return null;
    // Reads this render's `wire`, not a ref: every caller is a gesture/tap handler,
    // and remote updates are deferred while a finger is down, so it can't be stale.
    const topZ = () => wire.reduce((m, p) => Math.max(m, p.zIndex), 0);
    const base = (over: Partial<CanvasItem>): CanvasItem => ({
      id: uid(), // client-unique: two people can add in the same millisecond
      kind: "item",
      x: 290,
      y: 220,
      width: 420,
      height: 420,
      rotation: 0,
      zIndex: topZ() + 1,
      flipped: false,
      ...over,
    });
    const me = profile.displayName || profileHandle(profile) || "Someone";
    return {
      nodes,
      bg: session.canvasBg,
      items: trayItems,
      aspect: session.aspect === "1:1" ? "1:1" : "3:4",
      setAspect: (a) => {
        setSession((s) => (s ? { ...s, aspect: a } : s));
        if (sessionId) void setBoardSettings(sessionId, { aspect: a }).catch(() => {});
      },
      add: (itemId) => put(base({ itemId })),
      addText: (text, color) =>
        put(base({ kind: "text", text, color, width: 560, height: 180 })),
      addSticker: (emoji) => put(base({ kind: "sticker", emoji, width: 260, height: 260 })),
      update: (id, patch) => {
        const cur = wire.find((p) => p.pieceId === id);
        if (cur) put({ ...pieceToCanvas(cur, BOARD), ...patch });
      },
      remove: (id) => {
        setWire((prev) => prev.filter((p) => p.pieceId !== id));
        if (sessionId) void removePiece(sessionId, id).catch(() => {});
      },
      replace: (next) => {
        const rows = next.map((c) => canvasToPiece(c, BOARD));
        setWire(rows.map((r) => ({ ...r, updatedBy: myId, updatedAt: "" })));
        if (sessionId) void replaceBoard(sessionId, rows).catch(() => {});
      },
      setBg: (next) => {
        setSession((s) => (s ? { ...s, canvasBg: next } : s));
        if (sessionId) void setBoardSettings(sessionId, { canvasBg: next }).catch(() => {});
      },
      title: iAmOwner
        ? `${them?.name || "A friend"} is styling you`
        : `Styling ${them?.name || "them"}`,
      subtitle: `Live · ${nodes.length} ${nodes.length === 1 ? "piece" : "pieces"}`,
      saveLabel: "Save",
      canSave: iAmOwner,
      onSave: (name) => {
        const ids = [...new Set(nodes.filter((c) => c.itemId).map((c) => c.itemId as string))];
        saveOutfit(name, "", ids, nodes, session.canvasBg ?? null);
        const savedId = useWardrobe.getState().outfits[0]?.id;
        if (savedId && sessionId) void markSaved(sessionId, savedId).catch(() => {});
        setView("outfits");
      },
      onClose: () => setView("outfits"),
      onEnd: () => {
        if (sessionId) void endSession(sessionId).catch(() => {});
        setView("outfits");
      },
      heldByThem:
        grab?.pieceId && grab.by !== myId
          ? { pieceId: grab.pieceId, name: grab.name || "Them" }
          : null,
      onGrab: (id) => {
        heldRef.current = id;
        sendGrabRef.current?.({ pieceId: id, by: myId ?? "", name: me });
      },
      onRelease: (id) => {
        if (heldRef.current === id) heldRef.current = null;
        sendGrabRef.current?.({ pieceId: null, by: myId ?? "", name: me });
        if (pendingRef.current) {
          pendingRef.current = false;
          refresh();
        }
      },
    };
  }, [
    session, live, nodes, wire, trayItems, sessionId, BOARD, myId, grab, iAmOwner,
    them, profile, put, saveOutfit, setView, refresh,
  ]);

  /* ----------------------------------------------------------------- views */
  if (!sessionId) {
    return <Ended title="No session open" body="Pick a styling session from Outfits." onBack={() => setView("outfits")} />;
  }
  if (loading) {
    return <p className="py-16 text-center text-sm text-muted">Opening the board…</p>;
  }
  if (!session) {
    return <Ended title="Session not found" body="It may have been ended." onBack={() => setView("outfits")} />;
  }
  // Branch on plain state, not on `collab` — the memo closes over the presence refs,
  // and reading it in a condition trips react-hooks/refs. Reaching here means
  // session && live, which is exactly when the memo is non-null.
  if (!live) {
    return (
      <Ended
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

  return <CanvasBuilderView collab={collab as CollabCanvas} />;
}

function Ended({
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
