/**
 * Chat / direct-messages data layer (AJA-110). Private participant-only threads
 * read/written through the browser Supabase client so RLS enforces membership.
 * Mirrors community.ts conventions (getSupabase null-checks, inline currentUserId,
 * denormalized author identity). Conversation creation + user search go through
 * security-definer RPCs (see 20260718_chat.sql) for atomic inserts, 1:1 dedupe,
 * and bidirectional block exclusion.
 */

import { profileHandle, type UserProfile } from "./profile";
import { getSupabase } from "./supabase/client";
import type { Outfit, WardrobeItem } from "./types";

export type ChatKind = "text" | "image" | "outfit" | "item" | "look";

/** A piece embedded in a shared outfit/item/look (self-contained — renders on the
 *  recipient's device without resolving ids against their closet). */
export interface SharedPiece {
  id?: string;
  name?: string;
  imageUrl?: string;
  brand?: string;
  category?: string;
  productUrl?: string;
  price?: number;
  currency?: string;
}

export interface ChatPayload {
  title?: string;
  pieces?: SharedPiece[];
  imageUrl?: string;
}

export interface ChatAuthor {
  name: string;
  handle: string;
  avatar?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderHandle: string;
  senderAvatar?: string;
  kind: ChatKind;
  body?: string;
  payload?: ChatPayload | null;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  isGroup: boolean;
  /** Display title: group title, or the other person's name for a 1:1. */
  title: string;
  handle?: string;
  avatar?: string;
  otherIds: string[];
  memberCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: boolean;
}

export interface SearchUser {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/* -------------------------------------------------- shared-content payloads */

/** Compact a closet item into a self-contained shared piece. */
export function itemToPiece(it: WardrobeItem): SharedPiece {
  return {
    id: it.id,
    name: it.name,
    imageUrl: it.imageUrl,
    brand: it.brand,
    category: it.category,
    productUrl: it.productUrl,
    price: it.price,
  };
}

/** Snapshot a saved outfit (resolving its item ids) so it renders cross-user. */
export function outfitPayload(outfit: Outfit, items: WardrobeItem[]): ChatPayload {
  const pieces = outfit.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is WardrobeItem => !!i)
    .map(itemToPiece);
  return { title: outfit.name, pieces };
}

/** Snapshot a single closet item. */
export function itemPayload(it: WardrobeItem): ChatPayload {
  return { title: it.name, pieces: [itemToPiece(it)] };
}

async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

/* ------------------------------------------------------------------ profiles */

/** Upsert the signed-in user into the public directory so username search works.
 *  Resilient to a username collision with another account (uniquifies + retries). */
export async function ensureProfile(
  profile: Pick<UserProfile, "displayName" | "username" | "email" | "avatarUrl" | "bio">,
  userId: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const handle = profileHandle({
    username: profile.username,
    email: profile.email,
    displayName: profile.displayName,
  });
  const row = {
    id: userId,
    username: handle,
    display_name: profile.displayName || null,
    avatar_url: profile.avatarUrl || null,
    bio: profile.bio || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("profiles").upsert(row, { onConflict: "id" });
  if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message))) {
    await sb
      .from("profiles")
      .upsert({ ...row, username: `${handle}-${userId.slice(0, 4)}` }, { onConflict: "id" });
  }
}

/** Find people by @handle or name (excludes blocked/blocking users, both ways). */
export async function searchUsers(q: string): Promise<SearchUser[]> {
  const sb = getSupabase();
  if (!sb || !q.trim()) return [];
  const { data, error } = await sb.rpc("search_users", { q: q.trim() });
  if (error) return [];
  return (data ?? []).map((r: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  }) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
  }));
}

/* ------------------------------------------------------------ conversations */

interface ConversationRow {
  id: string;
  is_group: boolean;
  title: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
}

/** My conversations, newest-first, with the other party's identity + unread flag. */
export async function fetchConversations(): Promise<ChatConversation[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const uid = await currentUserId();
  if (!uid) return [];

  const { data: mine } = await sb
    .from("conversation_participants")
    .select("conversation_id,last_read_at")
    .eq("user_id", uid);
  const myRows = (mine ?? []) as { conversation_id: string; last_read_at: string | null }[];
  if (!myRows.length) return [];
  const convIds = myRows.map((r) => r.conversation_id);
  const readById = new Map(myRows.map((r) => [r.conversation_id, r.last_read_at]));

  const [{ data: convs }, { data: parts }] = await Promise.all([
    sb.from("conversations").select("*").in("id", convIds).order("last_message_at", { ascending: false, nullsFirst: false }),
    sb.from("conversation_participants").select("conversation_id,user_id").in("conversation_id", convIds),
  ]);

  const partRows = (parts ?? []) as { conversation_id: string; user_id: string }[];
  const othersByConv = new Map<string, string[]>();
  for (const p of partRows) {
    if (p.user_id === uid) continue;
    const arr = othersByConv.get(p.conversation_id) ?? [];
    arr.push(p.user_id);
    othersByConv.set(p.conversation_id, arr);
  }
  const otherIds = [...new Set(partRows.map((p) => p.user_id).filter((id) => id !== uid))];

  const profById = new Map<string, { username: string | null; display_name: string | null; avatar_url: string | null }>();
  if (otherIds.length) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id,username,display_name,avatar_url")
      .in("id", otherIds);
    for (const p of (profs ?? []) as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]) {
      profById.set(p.id, p);
    }
  }

  return ((convs ?? []) as ConversationRow[]).map((c) => {
    const others = othersByConv.get(c.id) ?? [];
    const lastRead = readById.get(c.id) ?? null;
    const unread = !!c.last_message_at && (!lastRead || c.last_message_at > lastRead);
    let title = c.title ?? "";
    let handle: string | undefined;
    let avatar: string | undefined;
    if (!c.is_group) {
      const other = others[0] ? profById.get(others[0]) : undefined;
      title = other?.display_name || (other?.username ? `@${other.username}` : "Conversation");
      handle = other?.username ?? undefined;
      avatar = other?.avatar_url ?? undefined;
    } else if (!title) {
      title = `Group · ${others.length + 1}`;
    }
    return {
      id: c.id,
      isGroup: c.is_group,
      title,
      handle,
      avatar,
      otherIds: others,
      memberCount: others.length + 1,
      lastMessageAt: c.last_message_at,
      lastMessagePreview: c.last_message_preview,
      unread,
    };
  });
}

/** Create (or reuse, for 1:1) a conversation. `otherIds` excludes the caller. */
export async function createConversation(
  otherIds: string[],
  isGroup: boolean,
  title?: string,
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("create_or_get_conversation", {
    p_participants: otherIds,
    p_is_group: isGroup,
    p_title: title ?? null,
  });
  if (error) throw new Error(error.message);
  return (data as string) ?? null;
}

/* ------------------------------------------------------------------ messages */

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_handle: string | null;
  sender_avatar: string | null;
  kind: ChatKind;
  body: string | null;
  payload: ChatPayload | null;
  created_at: string;
}

function toMessage(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    senderName: r.sender_name ?? "Someone",
    senderHandle: r.sender_handle ?? "user",
    senderAvatar: r.sender_avatar ?? undefined,
    kind: r.kind,
    body: r.body ?? undefined,
    payload: r.payload ?? null,
    createdAt: r.created_at,
  };
}

export interface MessagePage {
  messages: ChatMessage[]; // ascending (oldest → newest) for display
  nextCursor: string | null; // ISO created_at to load older
}

/** A page of messages, ascending for display. `before` loads older messages. */
export async function fetchMessages(
  convId: string,
  opts: { limit?: number; before?: string | null } = {},
): Promise<MessagePage> {
  const sb = getSupabase();
  if (!sb) return { messages: [], nextCursor: null };
  const limit = opts.limit ?? 40;
  let q = sb
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data, error } = await q;
  if (error) return { messages: [], nextCursor: null };
  const rows = (data ?? []) as MessageRow[];
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && slice.length ? slice[slice.length - 1].created_at : null;
  const messages = slice.map(toMessage).reverse(); // ascending
  return { messages, nextCursor };
}

export async function sendMessage(
  convId: string,
  msg: { kind: ChatKind; body?: string; payload?: ChatPayload | null },
  author: ChatAuthor,
): Promise<ChatMessage | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const uid = await currentUserId();
  if (!uid) throw new Error("Sign in to message");
  const { data, error } = await sb
    .from("messages")
    .insert({
      conversation_id: convId,
      sender_id: uid,
      sender_name: author.name,
      sender_handle: author.handle,
      sender_avatar: author.avatar ?? null,
      kind: msg.kind,
      body: msg.body ?? null,
      payload: msg.payload ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toMessage(data as MessageRow);
}

/** Mark a conversation read up to the newest loaded message (never `now()`), and
 *  never move the marker backward. */
export async function markRead(convId: string, lastMessageCreatedAt: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUserId();
  if (!uid) return;
  // Read current marker and only advance it — never move backward, and don't
  // clobber a read that already covers a same-second arrival.
  const { data } = await sb
    .from("conversation_participants")
    .select("last_read_at")
    .eq("conversation_id", convId)
    .eq("user_id", uid)
    .maybeSingle();
  const cur = (data as { last_read_at: string | null } | null)?.last_read_at ?? null;
  if (cur && cur >= lastMessageCreatedAt) return;
  await sb
    .from("conversation_participants")
    .update({ last_read_at: lastMessageCreatedAt })
    .eq("conversation_id", convId)
    .eq("user_id", uid);
}

/** Number of conversations with unread messages (drives the header badge). */
export async function unreadCount(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const uid = await currentUserId();
  if (!uid) return 0;
  const { data: mine } = await sb
    .from("conversation_participants")
    .select("conversation_id,last_read_at")
    .eq("user_id", uid);
  const myRows = (mine ?? []) as { conversation_id: string; last_read_at: string | null }[];
  if (!myRows.length) return 0;
  const readById = new Map(myRows.map((r) => [r.conversation_id, r.last_read_at]));
  const { data: convs } = await sb
    .from("conversations")
    .select("id,last_message_at")
    .in("id", myRows.map((r) => r.conversation_id));
  let n = 0;
  for (const c of (convs ?? []) as { id: string; last_message_at: string | null }[]) {
    const lastRead = readById.get(c.id) ?? null;
    if (c.last_message_at && (!lastRead || c.last_message_at > lastRead)) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ safety */

export async function blockUser(targetId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUserId();
  if (!uid || uid === targetId) return;
  await sb.from("blocks").insert({ blocker_id: uid, blocked_id: targetId });
}

export async function unblockUser(targetId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUserId();
  if (!uid) return;
  await sb.from("blocks").delete().eq("blocker_id", uid).eq("blocked_id", targetId);
}

export async function reportUser(
  targetId: string,
  opts: { messageId?: string; reason?: string } = {},
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUserId();
  if (!uid) return;
  await sb.from("reports").insert({
    reporter_id: uid,
    target_user_id: targetId,
    message_id: opts.messageId ?? null,
    reason: opts.reason ?? null,
  });
}

/** The current user's id, for "is this my message?" checks in the UI. */
export async function myUserId(): Promise<string | null> {
  return currentUserId();
}
