/**
 * Shared Closets data layer (collaborative, co-owned closet). Read and written
 * through the browser Supabase client so RLS enforces the rules: you see a closet
 * only if you're a member, only the owner renames/deletes it, but ANY joined
 * member can add, edit and remove ANY item (true co-ownership — the deliberate
 * difference from trips). Item fields are snapshotted into shared_closet_items
 * because each member's real closet lives in a private per-user wardrobe_snapshots
 * blob, so a member must render another member's item without reading that row.
 *
 * Members & invites (inviteMember/respondInvite/…) arrive in Phase 2 alongside the
 * notification migration; Phase 1 covers the closet + its items + live sync.
 */
import { getSupabase } from "./supabase/client";
import type { WardrobeItem } from "./types";

export interface SharedCloset {
  id: string;
  ownerId: string;
  name: string;
  coverUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SharedClosetItem {
  id: string;
  closetId: string;
  addedBy: string;
  itemRef: string;
  name: string | null;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
  color: string | null;
  createdAt: string;
}

export interface ClosetMember {
  userId: string;
  role: string; // 'owner' | 'member'
  status: string; // 'invited' | 'joined'
  name: string | null;
  handle: string | null;
  avatar: string | null;
}

/** A display identity for denormalizing onto membership rows (rendered without a join). */
export interface Identity {
  name: string;
  handle: string;
  avatar?: string;
}

interface ClosetRow {
  id: string;
  owner_id: string;
  name: string;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}
interface ItemRow {
  id: string;
  closet_id: string;
  added_by: string;
  item_ref: string;
  item_name: string | null;
  item_image_url: string | null;
  item_category: string | null;
  item_brand: string | null;
  item_color: string | null;
  created_at: string;
}

export async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

function toCloset(r: ClosetRow): SharedCloset {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    coverUrl: r.cover_url ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function toItem(r: ItemRow): SharedClosetItem {
  return {
    id: r.id,
    closetId: r.closet_id,
    addedBy: r.added_by,
    itemRef: r.item_ref,
    name: r.item_name,
    imageUrl: r.item_image_url,
    category: r.item_category,
    brand: r.item_brand,
    color: r.item_color,
    createdAt: r.created_at,
  };
}

/**
 * Closets the caller owns or has joined. Queried through shared_closet_members
 * (not shared_closets directly) so pending invites don't leak in; those surface
 * via listPendingInvites() in Phase 2. Owners have a joined membership row.
 */
export async function listSharedClosets(): Promise<SharedCloset[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await sb
    .from("shared_closet_members")
    .select("shared_closets(*)")
    .eq("user_id", me)
    .eq("status", "joined");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as {
    shared_closets: ClosetRow | ClosetRow[] | null;
  }[];
  return rows
    .map((r) => (Array.isArray(r.shared_closets) ? r.shared_closets[0] : r.shared_closets))
    .filter((c): c is ClosetRow => Boolean(c))
    .map(toCloset)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createSharedCloset(
  name: string,
  me?: Identity,
): Promise<SharedCloset> {
  const sb = getSupabase();
  if (!sb) throw new Error("Offline");
  const owner = await currentUserId();
  if (!owner) throw new Error("Sign in to create a shared closet");
  const { data, error } = await sb
    .from("shared_closets")
    .insert({ owner_id: owner, name: name.trim() || "Shared closet" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const closet = toCloset(data as ClosetRow);
  // Stamp the owner's identity onto their auto-created membership row so
  // collaborators see a name (the DB auto-join trigger can't know it).
  if (me) {
    await sb
      .from("shared_closet_members")
      .update({ member_name: me.name, member_handle: me.handle, member_avatar: me.avatar ?? null })
      .eq("closet_id", closet.id)
      .eq("user_id", owner);
  }
  return closet;
}

/** Rename (owner only, per RLS). */
export async function renameSharedCloset(id: string, name: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("shared_closets")
    .update({ name: name.trim() || "Shared closet" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Delete the whole closet (owner only, per RLS). */
export async function deleteSharedCloset(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("shared_closets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Every item in a closet (all members'). RLS returns them only to members. */
export async function listClosetItems(closetId: string): Promise<SharedClosetItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("shared_closet_items")
    .select("*")
    .eq("closet_id", closetId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ItemRow[]).map(toItem);
}

/** Count of items per closet (for the list card meta). */
export async function closetItemCounts(): Promise<Record<string, number>> {
  const sb = getSupabase();
  if (!sb) return {};
  const { data, error } = await sb.from("shared_closet_items").select("closet_id");
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of data as { closet_id: string }[]) {
    out[r.closet_id] = (out[r.closet_id] ?? 0) + 1;
  }
  return out;
}

/**
 * Add items from your own closet into the shared closet (snapshotted). Any member
 * may add; idempotent via the (closet_id,item_ref,added_by) unique constraint.
 */
export async function addItemsFromMyCloset(
  closetId: string,
  items: WardrobeItem[],
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const me = await currentUserId();
  if (!me) throw new Error("Sign in to add items");
  const rows = items
    .filter((it) => it.imageUrl)
    .map((it) => ({
      closet_id: closetId,
      added_by: me,
      item_ref: it.id,
      item_name: it.name,
      item_image_url: it.imageUrl,
      item_category: it.category,
      item_brand: it.brand ?? null,
      item_color: it.color ?? null,
    }));
  if (!rows.length) return;
  const { error } = await sb
    .from("shared_closet_items")
    .upsert(rows, { onConflict: "closet_id,item_ref,added_by", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/** Edit an item in the shared closet (any member — co-owned). */
export async function updateClosetItem(
  id: string,
  patch: { name?: string; category?: string; brand?: string | null; color?: string | null },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.item_name = patch.name;
  if (patch.category !== undefined) row.item_category = patch.category;
  if (patch.brand !== undefined) row.item_brand = patch.brand || null;
  if (patch.color !== undefined) row.item_color = patch.color || null;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("shared_closet_items").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Remove an item from the shared closet (any member — co-owned). */
export async function removeClosetItem(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("shared_closet_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Everyone on a closet (joined + invited), for the collaborators row. */
export async function listMembers(closetId: string): Promise<ClosetMember[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("shared_closet_members")
    .select("user_id, role, status, member_name, member_handle, member_avatar")
    .eq("closet_id", closetId);
  if (error) throw new Error(error.message);
  return (
    data as {
      user_id: string;
      role: string;
      status: string;
      member_name: string | null;
      member_handle: string | null;
      member_avatar: string | null;
    }[]
  ).map((r) => ({
    userId: r.user_id,
    role: r.role,
    status: r.status,
    name: r.member_name,
    handle: r.member_handle,
    avatar: r.member_avatar,
  }));
}

export interface PendingInvite {
  closet: SharedCloset;
  invitedBy: string | null;
  inviterName: string | null;
}

/** Shared closets the caller has been invited to but not yet joined. */
export async function listPendingInvites(): Promise<PendingInvite[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await sb
    .from("shared_closet_members")
    .select("invited_by, inviter_name, shared_closets(*)")
    .eq("user_id", me)
    .eq("status", "invited");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as {
    invited_by: string | null;
    inviter_name: string | null;
    shared_closets: ClosetRow | ClosetRow[] | null;
  }[];
  return rows
    .map((r) => ({
      closet: Array.isArray(r.shared_closets) ? r.shared_closets[0] : r.shared_closets,
      invitedBy: r.invited_by,
      inviterName: r.inviter_name,
    }))
    .filter(
      (r): r is { closet: ClosetRow; invitedBy: string | null; inviterName: string | null } =>
        Boolean(r.closet),
    )
    .map((r) => ({ closet: toCloset(r.closet), invitedBy: r.invitedBy, inviterName: r.inviterName }));
}

/** Owner invites someone they follow. Idempotent (unique membership PK). */
export async function inviteMember(
  closetId: string,
  invitee: { id: string; name: string; handle: string; avatar?: string },
  inviter: Identity,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const me = await currentUserId();
  if (!me) throw new Error("Sign in");
  const { error } = await sb.from("shared_closet_members").insert({
    closet_id: closetId,
    user_id: invitee.id,
    role: "member",
    status: "invited",
    invited_by: me,
    member_name: invitee.name,
    member_handle: invitee.handle,
    member_avatar: invitee.avatar ?? null,
    inviter_name: inviter.name,
    inviter_handle: inviter.handle,
    inviter_avatar: inviter.avatar ?? null,
  });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
}

/** Accept (status → joined) or decline (delete the row) an invite. */
export async function respondInvite(closetId: string, accept: boolean): Promise<void> {
  if (!accept) return leaveSharedCloset(closetId);
  const sb = getSupabase();
  if (!sb) return;
  const me = await currentUserId();
  if (!me) return;
  const { error } = await sb
    .from("shared_closet_members")
    .update({ status: "joined" })
    .eq("closet_id", closetId)
    .eq("user_id", me);
  if (error) throw new Error(error.message);
}

/** Leave a shared closet (or decline an invite) — removes only your own row. */
export async function leaveSharedCloset(closetId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const me = await currentUserId();
  if (!me) return;
  const { error } = await sb
    .from("shared_closet_members")
    .delete()
    .eq("closet_id", closetId)
    .eq("user_id", me);
  if (error) throw new Error(error.message);
}

/**
 * Live sync: fire `onChange` whenever this closet's items or roster change on the
 * server, so co-owners see each other's edits without reselecting. RLS applies to
 * realtime too, so a subscriber only hears about rows they can read. Returns an
 * unsubscribe function.
 */
export function subscribeSharedCloset(closetId: string, onChange: () => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  // Best-effort: hand realtime the session token so RLS-filtered changes flow.
  sb.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (token) sb.realtime.setAuth(token);
  });
  const channel = sb
    .channel(`shared-closet:${closetId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "shared_closet_items", filter: `closet_id=eq.${closetId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "shared_closet_members", filter: `closet_id=eq.${closetId}` },
      onChange,
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
