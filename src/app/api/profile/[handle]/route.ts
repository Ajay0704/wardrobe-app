/**
 * Public read-only profile lookup for the guest page at /u/[handle]. Resolves a
 * username to its public profile + recent posts + follow counts. All data comes
 * from public-read tables (profiles, posts, follows), so no auth is required —
 * this backs a shareable per-user link that works without the app.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function readClient(): SupabaseClient | null {
  // Prefer the service-role client (prod); fall back to the public anon client.
  const admin = adminClient();
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<Response> {
  const { handle } = await params;
  const clean = (handle || "").replace(/^@/, "").trim();
  if (!clean) return Response.json({ error: "Handle required." }, { status: 400 });

  const sb = readClient();
  if (!sb) return Response.json({ error: "Server storage not configured." }, { status: 503 });

  const { data: prof } = await sb
    .from("profiles")
    .select("id,username,display_name,avatar_url,bio")
    .ilike("username", clean)
    .limit(1)
    .maybeSingle();
  if (!prof) return Response.json({ error: "Profile not found." }, { status: 404 });

  const POST_COLS = "id,kind,image_url,caption,look_title";
  const [postsRes, taggedRes, repostsRes, followersRes, followingRes] = await Promise.all([
    sb.from("posts").select(POST_COLS).eq("author_id", prof.id).order("created_at", { ascending: false }).limit(60),
    sb.from("posts").select(POST_COLS).contains("tagged_user_ids", [prof.id]).order("created_at", { ascending: false }).limit(60),
    sb
      .from("post_reposts")
      .select(`created_at, posts(${POST_COLS})`)
      .eq("reposter_id", prof.id)
      .order("created_at", { ascending: false })
      .limit(60),
    sb.from("follows").select("*", { count: "exact", head: true }).eq("following_id", prof.id),
    sb.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", prof.id),
  ]);

  type Row = { id: string; kind: string; image_url: string | null; caption: string | null; look_title: string | null };
  const toLite = (r: Row) => ({
    id: r.id,
    kind: r.kind,
    imageUrl: r.image_url ?? undefined,
    caption: r.caption ?? undefined,
    lookTitle: r.look_title ?? undefined,
  });

  const posts = ((postsRes.data ?? []) as Row[]).map(toLite);
  const tagged = ((taggedRes.data ?? []) as Row[]).map(toLite);
  const shared = ((repostsRes.data ?? []) as { posts: Row | Row[] | null }[])
    .map((r) => (Array.isArray(r.posts) ? (r.posts[0] ?? null) : r.posts))
    .filter((p): p is Row => Boolean(p))
    .map(toLite);

  return Response.json({
    profile: {
      handle: prof.username ?? clean,
      name: prof.display_name || `@${prof.username ?? clean}`,
      avatar: prof.avatar_url ?? undefined,
      bio: prof.bio ?? undefined,
    },
    counts: {
      followers: followersRes.count ?? 0,
      following: followingRes.count ?? 0,
      posts: posts.length,
    },
    posts,
    tagged,
    shared,
  });
}
