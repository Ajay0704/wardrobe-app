import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for API routes — bypasses RLS. Used for writes
 * the caller can't make directly (catalog, detections with server-only
 * embeddings, cross-user reads). Never import from client components.
 * Returns null when SUPABASE_SERVICE_ROLE_KEY isn't configured (local dev).
 */
let admin: SupabaseClient | null = null;

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!admin) {
    admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
