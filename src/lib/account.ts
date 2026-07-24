/**
 * Account deletion (App Store Guideline 5.1.1(v)). Calls the service-role route
 * that removes the Supabase auth user; DB foreign keys cascade the rest. On
 * success the caller clears the local session + snapshot and returns to the
 * landing screen.
 */
import { authHeaders } from "./supabase/client";

export async function deleteAccount(): Promise<void> {
  const res = await fetch("/api/account/delete", {
    method: "POST",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      body.error || "Couldn't delete your account. Please try again.",
    );
  }
}
