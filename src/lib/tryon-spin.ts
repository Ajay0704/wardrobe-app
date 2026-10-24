/**
 * AJA-305 — client seam for the 360° spin. Mirrors `tryOnOutfit`: auth headers in, the
 * route's own error text out (so TryOnView's existing "isn't configured" check applies).
 */
import { authHeaders } from "@/lib/supabase/client";

/**
 * `fresh` = "Make a new spin": film again even though the look has one. Without it, the
 * route answers with the render's existing first spin if there is one (AJA-308), free.
 */
export async function makeSpin(renderPath: string, opts: { fresh?: boolean } = {}): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/tryon-spin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ renderPath, ...(opts.fresh ? { fresh: true } : {}) }),
    });
  } catch {
    // The request itself died (iOS kills it when the app is backgrounded): the browser's
    // "Load failed" / "Failed to fetch" is no message for a user. The route may still finish
    // and store the clip. A FIRST spin is stored under the render's own name (AJA-308), so
    // reopening 360° finds it. The copy promises only that: whether a retry costs nothing
    // depends on timing the customer can't see, so it isn't promised. A fresh spin isn't
    // findable at all, so that message says only that the old one is kept.
    throw new Error(
      opts.fresh
        ? "Lost the connection while filming. Your spin is unchanged — try again in a minute."
        : "Lost the connection while filming. Reopen 360° in a minute — if it finished, it'll be there.",
    );
  }
  const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !data.path) throw new Error(data.error || `Spin failed (${res.status}).`);
  return data.path;
}
