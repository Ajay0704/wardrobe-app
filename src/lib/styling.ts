/**
 * Styling sessions data layer (AJA-240) — "a friend helps you get dressed".
 *
 * The OWNER asks; the friend accepts. Everything goes through the browser Supabase
 * client so RLS is the enforcement: you can only create a session naming yourself as
 * owner, only the friend who was asked can answer it, and the closet snapshot and the
 * board are readable only while the session is live. Ending it revokes access in the
 * database, not by hiding a screen.
 *
 * Closet items are snapshotted into styling_session_items for the same reason
 * shared_closet_items exist — a real closet lives in a private per-user
 * wardrobe_snapshots blob the friend can never read. They're seeded when the owner
 * asks (the owner is the only one who can write them, and they're the one who's
 * present at that moment), and refreshed when the board opens.
 */
import { getSupabase } from "./supabase/client";
import type { CanvasItem, WardrobeItem } from "./types";

export type SessionStatus = "requested" | "active" | "ended" | "declined";

export interface StylingSession {
  id: string;
  ownerId: string;
  stylistId: string;
  status: SessionStatus;
  note: string | null;
  aspect: string;
  canvasBg: string | null;
  savedOutfitId: string | null;
  owner: Identity;
  stylist: Identity;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  endedAt: string | null;
  expiresAt: string;
}

export interface StylingSessionItem {
  id: string;
  sessionId: string;
  itemRef: string;
  name: string | null;
  imageUrl: string | null;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  color: string | null;
}

/** One canvas element, in normalized 0..1 board coordinates. */
export interface StylingPiece {
  pieceId: string;
  kind: "item" | "text" | "sticker";
  itemRef: string | null;
  text: string | null;
  color: string | null;
  emoji: string | null;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  rotation: number;
  zIndex: number;
  flipped: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

/** A display identity, denormalized onto the session so cards render without a join. */
export interface Identity {
  name: string;
  handle: string;
  avatar?: string;
}

/** A closet big enough to hit this is already unusable to scroll through on a phone. */
export const MAX_SESSION_ITEMS = 300;

interface SessionRow {
  id: string;
  owner_id: string;
  stylist_id: string;
  status: string;
  note: string | null;
  aspect: string;
  canvas_bg: string | null;
  saved_outfit_id: string | null;
  owner_name: string | null;
  owner_handle: string | null;
  owner_avatar: string | null;
  stylist_name: string | null;
  stylist_handle: string | null;
  stylist_avatar: string | null;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
  ended_at: string | null;
  expires_at: string;
}
interface ItemRow {
  id: string;
  session_id: string;
  item_ref: string;
  item_name: string | null;
  item_image_url: string | null;
  item_category: string | null;
  item_subcategory: string | null;
  item_brand: string | null;
  item_color: string | null;
}
interface PieceRow {
  piece_id: string;
  kind: string;
  item_ref: string | null;
  text_content: string | null;
  color: string | null;
  emoji: string | null;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  rotation: number;
  z_index: number;
  flipped: boolean;
  updated_by: string | null;
  updated_at: string;
}

const PIECE_COLS =
  "piece_id, kind, item_ref, text_content, color, emoji, nx, ny, nw, nh, rotation, z_index, flipped, updated_by, updated_at";

export async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

function toSession(r: SessionRow): StylingSession {
  return {
    id: r.id,
    ownerId: r.owner_id,
    stylistId: r.stylist_id,
    status: r.status as SessionStatus,
    note: r.note,
    aspect: r.aspect || "3:4",
    canvasBg: r.canvas_bg,
    savedOutfitId: r.saved_outfit_id,
    owner: {
      name: r.owner_name ?? "",
      handle: r.owner_handle ?? "",
      avatar: r.owner_avatar ?? undefined,
    },
    stylist: {
      name: r.stylist_name ?? "",
      handle: r.stylist_handle ?? "",
      avatar: r.stylist_avatar ?? undefined,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    respondedAt: r.responded_at,
    endedAt: r.ended_at,
    expiresAt: r.expires_at,
  };
}

function toItem(r: ItemRow): StylingSessionItem {
  return {
    id: r.id,
    sessionId: r.session_id,
    itemRef: r.item_ref,
    name: r.item_name,
    imageUrl: r.item_image_url,
    category: r.item_category,
    subcategory: r.item_subcategory,
    brand: r.item_brand,
    color: r.item_color,
  };
}

function toPiece(r: PieceRow): StylingPiece {
  return {
    pieceId: r.piece_id,
    kind: r.kind === "text" || r.kind === "sticker" ? r.kind : "item",
    itemRef: r.item_ref,
    text: r.text_content,
    color: r.color,
    emoji: r.emoji,
    nx: r.nx,
    ny: r.ny,
    nw: r.nw,
    nh: r.nh,
    rotation: r.rotation,
    zIndex: r.z_index,
    flipped: r.flipped,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

/* ------------------------------------------------------------------ sessions */

/**
 * Ask a friend for help. Creates the session AND seeds the closet snapshot in one go,
 * because the owner is the only one allowed to write those rows and they're the one
 * who's here. Nothing leaks early: the friend can't read the items until they accept
 * and the session flips to 'active'.
 */
export async function askForStyling(
  friend: { id: string; name: string; handle: string; avatar?: string },
  note: string,
  items: WardrobeItem[],
  me: Identity,
): Promise<StylingSession> {
  const sb = getSupabase();
  if (!sb) throw new Error("Offline");
  const owner = await currentUserId();
  if (!owner) throw new Error("Sign in to ask a friend for help");
  if (owner === friend.id) throw new Error("You can't ask yourself");

  const { data, error } = await sb
    .from("styling_sessions")
    .insert({
      owner_id: owner,
      stylist_id: friend.id,
      status: "requested",
      note: note.trim() || null,
      owner_name: me.name,
      owner_handle: me.handle,
      owner_avatar: me.avatar ?? null,
      stylist_name: friend.name,
      stylist_handle: friend.handle,
      stylist_avatar: friend.avatar ?? null,
    })
    .select("*")
    .single();
  if (error) {
    // The partial unique index on (owner_id, stylist_id) where status is live.
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error(`You already have a session open with ${friend.name}`);
    }
    throw new Error(error.message);
  }
  const session = toSession(data as SessionRow);
  await syncSessionItems(session.id, items);
  return session;
}

/** Every session I'm part of, newest first — mine to run and mine to answer. */
export async function listMySessions(): Promise<StylingSession[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await sb
    .from("styling_sessions")
    .select("*")
    .or(`owner_id.eq.${me},stylist_id.eq.${me}`)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return ((data ?? []) as SessionRow[]).map(toSession);
}

/** The pending asks and the live session — what the Outfits card renders. */
export async function listOpenSessions(): Promise<StylingSession[]> {
  const all = await listMySessions();
  return all.filter((s) => s.status === "requested" || s.status === "active");
}

export async function getSession(sessionId: string): Promise<StylingSession | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("styling_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toSession(data as SessionRow) : null;
}

/**
 * The friend answers. Accepting flips to 'active', which is the moment their access
 * actually opens — the guard trigger rejects this from anyone but the person asked.
 */
export async function respondToAsk(sessionId: string, accept: boolean): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Offline");
  const { error } = await sb
    .from("styling_sessions")
    .update({ status: accept ? "active" : "declined" })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

/** Either side closes it. Also used by the owner to cancel an ask nobody answered. */
export async function endSession(sessionId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Offline");
  const { error } = await sb
    .from("styling_sessions")
    .update({ status: "ended" })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

/** Board settings are shared, so both phones show the same shape and background. */
export async function setBoardSettings(
  sessionId: string,
  patch: { aspect?: string; canvasBg?: string | null },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const row: Record<string, unknown> = {};
  if (patch.aspect !== undefined) row.aspect = patch.aspect;
  if (patch.canvasBg !== undefined) row.canvas_bg = patch.canvasBg;
  if (!Object.keys(row).length) return;
  const { error } = await sb.from("styling_sessions").update(row).eq("id", sessionId);
  if (error) throw new Error(error.message);
}

/** Record which outfit the owner saved, so the friend's screen can say it landed. */
export async function markSaved(sessionId: string, outfitId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("styling_sessions")
    .update({ saved_outfit_id: outfitId })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

/* --------------------------------------------------------------------- items */

export async function listSessionItems(sessionId: string): Promise<StylingSessionItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("styling_session_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ItemRow[]).map(toItem);
}

/**
 * Push the owner's current closet into the session. Wishlist items are excluded (they
 * aren't owned yet) along with anything with no image, since the friend can only work
 * with what they can see. Upsert-only — re-running it after adding a few items is
 * cheap and doesn't disturb the board.
 */
export async function syncSessionItems(
  sessionId: string,
  items: WardrobeItem[],
): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const rows = items
    .filter((it) => !it.wishlist && !!it.imageUrl)
    .slice(0, MAX_SESSION_ITEMS)
    .map((it) => ({
      session_id: sessionId,
      item_ref: it.id,
      item_name: it.name || null,
      item_image_url: it.imageUrl,
      item_category: it.category ?? null,
      item_subcategory: it.subcategory ?? null,
      item_brand: it.brand ?? null,
      item_color: it.color ?? null,
    }));
  if (!rows.length) return 0;
  const { error } = await sb
    .from("styling_session_items")
    .upsert(rows, { onConflict: "session_id,item_ref" });
  if (error) throw new Error(error.message);
  return rows.length;
}

/* -------------------------------------------------------------------- pieces */

export async function listPieces(sessionId: string): Promise<StylingPiece[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("styling_session_pieces")
    .select(PIECE_COLS)
    .eq("session_id", sessionId)
    .order("z_index", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as PieceRow[]).map(toPiece);
}

/**
 * One write per gesture end. `updated_by` is stamped so the other side can drop the
 * echo of its own change instead of re-rendering a piece it already moved.
 */
export async function upsertPiece(
  sessionId: string,
  piece: Omit<StylingPiece, "updatedBy" | "updatedAt">,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const me = await currentUserId();
  const { error } = await sb.from("styling_session_pieces").upsert(
    {
      session_id: sessionId,
      piece_id: piece.pieceId,
      kind: piece.kind,
      item_ref: piece.itemRef,
      text_content: piece.text,
      color: piece.color,
      emoji: piece.emoji,
      nx: piece.nx,
      ny: piece.ny,
      nw: piece.nw,
      nh: piece.nh,
      rotation: piece.rotation,
      z_index: piece.zIndex,
      flipped: piece.flipped,
      updated_by: me,
    },
    { onConflict: "session_id,piece_id" },
  );
  if (error) throw new Error(error.message);
}

export async function removePiece(sessionId: string, pieceId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("styling_session_pieces")
    .delete()
    .eq("session_id", sessionId)
    .eq("piece_id", pieceId);
  if (error) throw new Error(error.message);
}

/** Used by "Surprise me" and by clearing the board — replaces every piece at once. */
export async function replaceBoard(
  sessionId: string,
  pieces: Omit<StylingPiece, "updatedBy" | "updatedAt">[],
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("styling_session_pieces")
    .delete()
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  for (const p of pieces) await upsertPiece(sessionId, p);
}

/* ------------------------------------------------------- board <-> wire maths */

export interface Board {
  w: number;
  h: number;
}

/**
 * Normalized fractions -> board pixels. The canvas works in pixels sized from the
 * viewport, so this is the only place device differences are reconciled.
 */
export function pieceToCanvas(p: StylingPiece, board: Board): CanvasItem {
  return {
    id: p.pieceId,
    kind: p.kind,
    itemId: p.itemRef ?? undefined,
    text: p.text ?? undefined,
    color: p.color ?? undefined,
    emoji: p.emoji ?? undefined,
    x: p.nx * board.w,
    y: p.ny * board.h,
    width: p.nw * board.w,
    height: p.nh * board.h,
    rotation: p.rotation,
    zIndex: p.zIndex,
    flipped: p.flipped,
  };
}

/** Board pixels -> normalized fractions, for the write. */
export function canvasToPiece(
  c: CanvasItem,
  board: Board,
): Omit<StylingPiece, "updatedBy" | "updatedAt"> {
  const w = board.w || 1;
  const h = board.h || 1;
  return {
    pieceId: c.id,
    kind: c.kind ?? "item",
    itemRef: c.itemId ?? null,
    text: c.text ?? null,
    color: c.color ?? null,
    emoji: c.emoji ?? null,
    nx: c.x / w,
    ny: c.y / h,
    nw: c.width / w,
    nh: c.height / h,
    rotation: c.rotation,
    zIndex: c.zIndex,
    flipped: c.flipped,
  };
}

/* ------------------------------------------------------------------- realtime */

/**
 * Every session I'm part of, live. Without this the person who asked sits on
 * "waiting for them" forever, because their card only refetched on navigation and the
 * accept happens on someone else's phone.
 *
 * Two filters rather than one: postgres_changes only supports a single `col=eq.value`
 * per listener, and I could be either side of the session.
 */
export function subscribeMySessions(myId: string, onChange: () => void): () => void {
  const sb = getSupabase();
  if (!sb || !myId) return () => {};
  sb.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (token) sb.realtime.setAuth(token);
  });
  const channel = sb
    .channel(`styling-mine:${myId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "styling_sessions", filter: `owner_id=eq.${myId}` },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "styling_sessions", filter: `stylist_id=eq.${myId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

/** Who is holding which piece right now. Ephemeral — never stored. */
export interface Grab {
  pieceId: string | null;
  by: string;
  name: string;
}

/**
 * Grab/release presence over Realtime *broadcast* (AJA-240). Deliberately not a
 * database column: it changes twice per gesture and is worthless a second later, so
 * it has no business being written down. This is what makes commit-level sync read as
 * live — while you hold a piece the other phone outlines it with your name, instead
 * of the piece simply teleporting on release with no explanation.
 */
export function subscribeGrabs(
  sessionId: string,
  onGrab: (g: Grab) => void,
): { send: (g: Grab) => void; leave: () => void } {
  const sb = getSupabase();
  if (!sb) return { send: () => {}, leave: () => {} };
  const channel = sb
    .channel(`styling-grab:${sessionId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "grab" }, ({ payload }) => onGrab(payload as Grab))
    .subscribe();
  return {
    send: (g) => {
      void channel.send({ type: "broadcast", event: "grab", payload: g });
    },
    leave: () => {
      sb.removeChannel(channel);
    },
  };
}

/**
 * Live board. Same idiom as subscribeSharedCloset: coarse "something changed →
 * refetch", never payload diffing. Subscribes to the session row too, so an accept or
 * an end lands on the other phone immediately.
 */
export function subscribeSession(
  sessionId: string,
  onChange: (table: "pieces" | "session") => void,
): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  // Best-effort: hand realtime the session token so RLS-filtered changes flow.
  sb.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (token) sb.realtime.setAuth(token);
  });
  const channel = sb
    .channel(`styling:${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "styling_session_pieces",
        filter: `session_id=eq.${sessionId}`,
      },
      () => onChange("pieces"),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "styling_sessions",
        filter: `id=eq.${sessionId}`,
      },
      () => onChange("session"),
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
