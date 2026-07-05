import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** True when both Supabase env vars are configured. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Synchronously check whether a Supabase auth token is stored, so the UI can
 * skip the "restoring session" splash for visitors who are clearly logged out
 * (no token) and show the landing immediately. supabase-js persists the
 * session under an `sb-<project-ref>-auth-token` localStorage key.
 */
export function hasStoredSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        return true;
      }
    }
  } catch {
    // localStorage can throw in some privacy modes — treat as no session.
  }
  return false;
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
