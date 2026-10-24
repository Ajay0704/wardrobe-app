/**
 * AJA-305 — client seam for the 360° spin. Mirrors `tryOnOutfit`: auth headers in, the
 * route's own error text out (so TryOnView's existing "isn't configured" check applies).
 */
import { authHeaders } from "@/lib/supabase/client";

export async function makeSpin(renderPath: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/tryon-spin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ renderPath }),
    });
  } catch {
    // The request itself died (iOS kills it when the app is backgrounded): the browser's
    // "Load failed" / "Failed to fetch" is no message for a user. The route may still have
    // finished and stored a clip, hence the nudge to check back.
    throw new Error("Lost the connection while filming — check your looks in a moment, then try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !data.path) throw new Error(data.error || `Spin failed (${res.status}).`);
  return data.path;
}
