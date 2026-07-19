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

/** Trips visible to the caller (owned or joined) — RLS decides which. Newest first. */
export async function listTrips(): Promise<Trip[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("trips")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as TripRow[]).map(toTrip);
}

export interface NewTrip {
  name?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
}

export async function createTrip(input: NewTrip = {}): Promise<Trip> {
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
  return toTrip(data as TripRow);
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
