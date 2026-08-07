/**
 * AJA-284 — the cross-table reference scan. Service-role only; never import from a
 * client component.
 *
 * Lives here rather than inside the route so it can be run against the real database
 * by `scripts/test-image-refs.mts`. A scan reachable only through an authenticated HTTP
 * call is a scan that gets shipped unrun, and "shipped unrun" is how AJA-283 went out
 * against a bucket with no delete policy.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { REF_SOURCES, ilikeOr, mentionsPath, type RefSource } from "./image-refs";

/**
 * jsonb can't be pattern-matched through PostgREST, so those columns are scanned in
 * memory. Past this many rows the scan is no longer honest and it fails closed rather
 * than quietly checking a prefix — at which point the answer is a Postgres function or
 * an `image_refs` index written at share time, not a bigger number here.
 */
export const MAX_SCAN_ROWS = 5000;

/**
 * Log the real reason, hand the caller a short one.
 *
 * The full text is a Postgres error and this response crosses to a browser. Table names
 * are already public through PostgREST's OpenAPI document, so naming the source leaks
 * nothing new — the raw message might. The server log keeps everything.
 */
function note(source: string, message: string): string {
  console.error(`[sweep-images] ${source}: ${message}`);
  return `${source}: scan failed`;
}

export interface ScanResult {
  /** Candidates something still points at. These must not be deleted. */
  referenced: Set<string>;
  /** True when any source could not be scanned completely — caller must delete nothing. */
  failed: boolean;
  /** Human-readable reasons, for the response body and the client console. */
  notes: string[];
}

/**
 * Which of `paths` is still referenced anywhere outside the item being deleted.
 *
 * `ownerId` is used for the owner's own snapshot — the client passes its in-memory
 * survivors, but that copy can be stale (another device, an unsynced edit), and the
 * snapshot row is the one place guaranteed to list every item the user still owns.
 *
 * `excludeItemId` is NOT optional in practice, and leaving it out silently turns the
 * whole sweep into a no-op. `deleteItem` fires this immediately while the snapshot push
 * is still in flight, so the row the server reads almost always STILL CONTAINS the item
 * being deleted. Without the exclusion every path reads as "referenced by an item you
 * own" and nothing is ever removed — the AJA-283 bug again, wearing a different hat.
 */
export async function scanReferences(
  admin: SupabaseClient,
  paths: readonly string[],
  ownerId: string,
  excludeItemId?: string,
): Promise<ScanResult> {
  const referenced = new Set<string>();
  const notes: string[] = [];
  let failed = false;

  const snap = await admin
    .from("wardrobe_snapshots")
    .select("items, profile")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (snap.error) {
    failed = true;
    notes.push(note("wardrobe_snapshots", snap.error.message));
  } else if (snap.data) {
    const items = Array.isArray(snap.data.items) ? (snap.data.items as unknown[]) : [];
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      if (excludeItemId && (it as { id?: unknown }).id === excludeItemId) continue;
      for (const p of paths) if (!referenced.has(p) && mentionsPath(it, p)) referenced.add(p);
    }
    // The avatar lives in the same bucket and is not an item, so it is checked separately.
    for (const p of paths)
      if (!referenced.has(p) && mentionsPath(snap.data.profile, p)) referenced.add(p);
  }

  for (const src of REF_SOURCES) {
    const failure = await collect(admin, src, paths, referenced);
    if (failure) {
      failed = true;
      notes.push(failure);
    }
  }

  return { referenced, failed, notes };
}

/**
 * Mark any candidate this source references. One round trip per table, not per path.
 * Returns an error string when the table could not be scanned completely, or null.
 */
async function collect(
  admin: SupabaseClient,
  src: RefSource,
  paths: readonly string[],
  referenced: Set<string>,
): Promise<string | null> {
  const pending = paths.filter((p) => !referenced.has(p));
  if (!pending.length) return null;

  if (src.text.length) {
    // `ilike` rather than an exact URL match: the stored value can carry a query string
    // or different encoding, and a false positive only keeps a blob — the direction we
    // want to be wrong in.
    const { data, error } = await admin
      .from(src.table)
      .select(src.text.join(","))
      .or(ilikeOr(src.text, pending))
      .limit(MAX_SCAN_ROWS);
    if (error) return note(src.table, error.message);
    for (const row of data ?? []) {
      for (const c of src.text) {
        const v = (row as unknown as Record<string, unknown>)[c];
        for (const p of pending) if (mentionsPath(v, p)) referenced.add(p);
      }
    }
  }

  for (const col of src.jsonb ?? []) {
    const still = paths.filter((p) => !referenced.has(p));
    if (!still.length) break;
    const { data, error } = await admin
      .from(src.table)
      .select(col)
      .not(col, "is", null)
      .limit(MAX_SCAN_ROWS);
    if (error) return note(`${src.table}.${col}`, error.message);
    const rows = data ?? [];
    // A full page means there may be more we never looked at — an incomplete scan, which
    // must not read as "unreferenced".
    if (rows.length >= MAX_SCAN_ROWS)
      return note(`${src.table}.${col}`, `over ${MAX_SCAN_ROWS} rows, scan incomplete`);
    for (const row of rows) {
      const v = (row as unknown as Record<string, unknown>)[col];
      for (const p of still) if (mentionsPath(v, p)) referenced.add(p);
    }
  }

  return null;
}
