/**
 * Server-side verification of a Supabase access token. The browser client
 * stores its session in localStorage (not cookies), so API routes can't read a
 * cookie — the client sends `Authorization: Bearer <access_token>` and we
 * validate it here. Keeps /api/extract and /api/tryon usable only by signed-in
 * users (prevents anonymous cost abuse / SSRF surface).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let server: SupabaseClient | null = null;

function serverClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!server) {
    server = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return server;
}

export async function requireUser(
  request: Request,
): Promise<{ id: string } | null> {
  // Dev/local mode: when Supabase isn't configured the whole app runs ungated
  // (see AppShell `gated`), so don't block the API routes either. In production
  // Supabase IS configured, so the token check below is always enforced.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { id: "local-dev" };
  }

  const token = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return null;
  const supabase = serverClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}
