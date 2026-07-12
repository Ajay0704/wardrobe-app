import { requireUser } from "@/lib/auth-server";
import type { ClosetShareItem } from "@/lib/closet-share";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Create a Share Closet link (signed-in). Guests open GET /api/closet-share?id= */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return Response.json({ error: "Please sign in to share your closet." }, { status: 401 });
  }

  const admin = adminClient();
  if (!admin) {
    return Response.json(
      { error: "Share Closet needs server storage (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 },
    );
  }

  let body: {
    question?: string;
    items?: ClosetShareItem[];
    ownerName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const question = (body.question || "").trim().slice(0, 280);
  const items = Array.isArray(body.items) ? body.items.slice(0, 8) : [];
  if (!question) {
    return Response.json({ error: "Add a question for your friends." }, { status: 400 });
  }
  if (!items.length) {
    return Response.json({ error: "Pick at least one item to share." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("closet_shares")
    .insert({
      user_id: user.id === "local-dev" ? null : user.id,
      question,
      items,
      owner_name: (body.ownerName || "").trim().slice(0, 80) || null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.warn("[closet-share]", error?.message);
    return Response.json(
      {
        error:
          error?.message?.includes("closet_shares")
            ? "Share Closet tables aren’t set up yet — run the closet_shares migration in Supabase."
            : error?.message || "Couldn't create share link.",
      },
      { status: 500 },
    );
  }

  return Response.json({ id: data.id as string });
}

/** Public fetch of a share + replies. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return Response.json({ error: "Missing share id." }, { status: 400 });
  }

  const admin = adminClient();
  if (!admin) {
    return Response.json({ error: "Share storage not configured." }, { status: 503 });
  }

  const { data: share, error } = await admin
    .from("closet_shares")
    .select("id, question, items, owner_name, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !share) {
    return Response.json({ error: "This share link wasn’t found." }, { status: 404 });
  }

  const { data: replies } = await admin
    .from("closet_share_replies")
    .select("id, author_name, message, suggested_item_ids, created_at")
    .eq("share_id", id)
    .order("created_at", { ascending: true });

  return Response.json({
    share: {
      id: share.id,
      question: share.question,
      items: share.items,
      ownerName: share.owner_name,
      createdAt: share.created_at,
    },
    replies: replies ?? [],
  });
}
