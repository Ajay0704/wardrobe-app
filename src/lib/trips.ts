/**
 * Trips data layer (pack with friends). Trips are a shared server resource
 * (tables trips / trip_members / trip_items) read and written through the browser
 * Supabase client so RLS enforces the rules: you see a trip only if you're a
 * member, you edit/invite only if you own it, and you pack only your OWN items.
 * Item fields are snapshotted into trip_items because closets live in private
 * per-user wardrobe_snapshots blobs — a member must be able to render a friend's
 * pick without reading that friend's private row.
 *
 * Phase 1 exercises the solo path (your own trips + your own bag). Members and
 * invites arrive in Phase 2, reusing the same tables.
 */
import { getSupabase } from "./supabase/client";
import type { Trip as LocalTrip, WardrobeItem } from "./types";

export interface Trip {
  id: string;
  ownerId: string;
  name: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripItem {
  id: string;
  tripId: string;
  packerId: string;
  itemRef: string;
  itemName: string | null;
  itemImageUrl: string | null;
  itemCategory: string | null;
  createdAt: string;
}

interface TripRow {
  id: string;
  owner_id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}
interface TripItemRow {
  id: string;
  trip_id: string;
  packer_id: string;
  item_ref: string;
  item_name: string | null;
  item_image_url: string | null;
  item_category: string | null;
  created_at: string;
}

export async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

function toTrip(r: TripRow): Trip {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    destination: r.destination ?? undefined,
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function toTripItem(r: TripItemRow): TripItem {
  return {
    id: r.id,
    tripId: r.trip_id,
    packerId: r.packer_id,
    itemRef: r.item_ref,
    itemName: r.item_name,
    itemImageUrl: r.item_image_url,
    itemCategory: r.item_category,
    createdAt: r.created_at,
  };
}

/**
 * Trips the caller owns or has joined. Queried through trip_members (not trips
 * directly) so pending invites — which the participant RLS policy also makes
 * visible — don't leak in here; those surface via listPendingInvites(). Owners
 * have a joined membership row (auto-join trigger), so this covers them too.
 */
export async function listTrips(): Promise<Trip[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await sb
    .from("trip_members")
    .select("trips(*)")
    .eq("user_id", me)
    .eq("status", "joined");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { trips: TripRow | TripRow[] | null }[];
  return rows
    .map((r) => (Array.isArray(r.trips) ? r.trips[0] : r.trips))
    .filter((t): t is TripRow => Boolean(t))
    .map(toTrip)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface NewTrip {
  name?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
}

/** A display identity for denormalizing onto membership rows (no profiles table). */
export interface Identity {
  name: string;
  handle: string;
  avatar?: string;
}

export async function createTrip(input: NewTrip = {}, me?: Identity): Promise<Trip> {
  const sb = getSupabase();
  if (!sb) throw new Error("Offline");
  const owner = await currentUserId();
  if (!owner) throw new Error("Sign in to plan a trip");
  const { data, error } = await sb
    .from("trips")
    .insert({
      owner_id: owner,
      name: input.name ?? "New trip",
      destination: input.destination ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const trip = toTrip(data as TripRow);
  // Stamp the owner's identity onto their auto-created membership row so
  // collaborators see a name (the DB auto-join trigger can't know it).
  if (me) {
    await sb
      .from("trip_members")
      .update({ member_name: me.name, member_handle: me.handle, member_avatar: me.avatar ?? null })
      .eq("trip_id", trip.id)
      .eq("user_id", owner);
  }
  return trip;
}

export async function updateTrip(id: string, patch: Partial<NewTrip>): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.destination !== undefined) row.destination = patch.destination || null;
  if (patch.startDate !== undefined) row.start_date = patch.startDate || null;
  if (patch.endDate !== undefined) row.end_date = patch.endDate || null;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("trips").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTrip(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("trips").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** All packed items for a trip (every member's) — RLS returns them only to members. */
export async function listTripItems(tripId: string): Promise<TripItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("trip_items")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as TripItemRow[]).map(toTripItem);
}

/** Count of the caller's OWN packed items per trip (for the card meta). */
export async function myPackedCounts(): Promise<Record<string, number>> {
  const sb = getSupabase();
  if (!sb) return {};
  const me = await currentUserId();
  if (!me) return {};
  const { data, error } = await sb.from("trip_items").select("trip_id").eq("packer_id", me);
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of data as { trip_id: string }[]) out[r.trip_id] = (out[r.trip_id] ?? 0) + 1;
  return out;
}

/** Pack one of your own items into a trip. Idempotent (unique constraint). */
export async function packItem(tripId: string, item: WardrobeItem): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const packer = await currentUserId();
  if (!packer) throw new Error("Sign in to pack");
  const { error } = await sb.from("trip_items").insert({
    trip_id: tripId,
    packer_id: packer,
    item_ref: item.id,
    item_name: item.name,
    item_image_url: item.imageUrl,
    item_category: item.category,
  });
  // Duplicate = already packed → treat as success (idempotent toggle).
  if (error && !/duplicate key|unique/i.test(error.message)) throw new Error(error.message);
}

export async function unpackItem(tripId: string, itemRef: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const packer = await currentUserId();
  if (!packer) return;
  const { error } = await sb
    .from("trip_items")
    .delete()
    .eq("trip_id", tripId)
    .eq("packer_id", packer)
    .eq("item_ref", itemRef);
  if (error) throw new Error(error.message);
}

/**
 * Live sync (Phase 3): fire `onChange` whenever this trip's items or roster change
 * on the server, so co-packers see each other's updates without reselecting. RLS
 * applies to realtime too, so a subscriber only hears about rows they can read.
 * Returns an unsubscribe function.
 */
export function subscribeTrip(tripId: string, onChange: () => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  // Best-effort: hand realtime the session token so RLS-filtered changes flow.
  sb.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (token) sb.realtime.setAuth(token);
  });
  const channel = sb
    .channel(`trip:${tripId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trip_items", filter: `trip_id=eq.${tripId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${tripId}` },
      onChange,
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

/* --------------------------------------------------------- members & invites */

export interface TripMember {
  userId: string;
  role: string; // 'owner' | 'member'
  status: string; // 'invited' | 'joined'
  name: string | null;
  handle: string | null;
  avatar: string | null;
}

export interface PendingInvite {
  trip: Trip;
  invitedBy: string | null;
  inviterName: string | null;
}

/** Everyone on a trip (joined + invited), for the collaborators row. */
export async function listMembers(tripId: string): Promise<TripMember[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("trip_members")
    .select("user_id, role, status, member_name, member_handle, member_avatar")
    .eq("trip_id", tripId);
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

/** Trips the caller has been invited to but not yet joined. */
export async function listPendingInvites(): Promise<PendingInvite[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await sb
    .from("trip_members")
    .select("invited_by, inviter_name, trips(*)")
    .eq("user_id", me)
    .eq("status", "invited");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as {
    invited_by: string | null;
    inviter_name: string | null;
    trips: TripRow | TripRow[] | null;
  }[];
  return rows
    .map((r) => ({
      trip: Array.isArray(r.trips) ? r.trips[0] : r.trips,
      invitedBy: r.invited_by,
      inviterName: r.inviter_name,
    }))
    .filter((r): r is { trip: TripRow; invitedBy: string | null; inviterName: string | null } =>
      Boolean(r.trip),
    )
    .map((r) => ({ trip: toTrip(r.trip), invitedBy: r.invitedBy, inviterName: r.inviterName }));
}

/** Owner invites someone they follow. Idempotent (unique membership PK). */
export async function inviteMember(
  tripId: string,
  invitee: { id: string; name: string; handle: string; avatar?: string },
  inviter: Identity,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const me = await currentUserId();
  if (!me) throw new Error("Sign in");
  const { error } = await sb.from("trip_members").insert({
    trip_id: tripId,
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
export async function respondInvite(tripId: string, accept: boolean): Promise<void> {
  if (!accept) return leaveTrip(tripId);
  const sb = getSupabase();
  if (!sb) return;
  const me = await currentUserId();
  if (!me) return;
  const { error } = await sb
    .from("trip_members")
    .update({ status: "joined" })
    .eq("trip_id", tripId)
    .eq("user_id", me);
  if (error) throw new Error(error.message);
}

/** Leave a trip (or decline an invite) — removes only your own membership row. */
export async function leaveTrip(tripId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const me = await currentUserId();
  if (!me) return;
  const { error } = await sb
    .from("trip_members")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", me);
  if (error) throw new Error(error.message);
}

/**
 * One-time migration of the old local (store) trips onto the server. Creates a
 * server trip per local trip and packs each still-owned item. Caller guards this
 * so it runs once (server empty + local non-empty + not-yet-migrated flag).
 * Returns how many trips were migrated.
 */
export async function migrateLocalTrips(
  local: LocalTrip[],
  itemsById: Map<string, WardrobeItem>,
): Promise<number> {
  let migrated = 0;
  for (const lt of local) {
    const created = await createTrip({
      name: lt.name,
      destination: lt.destination,
      startDate: lt.startDate,
      endDate: lt.endDate,
    });
    for (const refId of lt.itemIds) {
      const item = itemsById.get(refId);
      if (item) await packItem(created.id, item);
    }
    migrated++;
  }
  return migrated;
}
