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

/** Guest reply on a Share Closet link — no account required. */
export async function POST(request: Request) {
  const admin = adminClient();
  if (!admin) {
    return Response.json({ error: "Share storage not configured." }, { status: 503 });
  }

  let body: {
    shareId?: string;
    authorName?: string;
    message?: string;
    suggestedItemIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const shareId = (body.shareId || "").trim();
  const message = (body.message || "").trim().slice(0, 1000);
  const authorName = (body.authorName || "Friend").trim().slice(0, 60) || "Friend";
  const suggestedItemIds = Array.isArray(body.suggestedItemIds)
    ? body.suggestedItemIds.filter((x) => typeof x === "string").slice(0, 8)
    : [];

  if (!shareId || !message) {
    return Response.json({ error: "Share id and a message are required." }, { status: 400 });
  }

  const { data: share } = await admin
    .from("closet_shares")
    .select("id")
    .eq("id", shareId)
    .maybeSingle();
  if (!share) {
    return Response.json({ error: "This share link wasn’t found." }, { status: 404 });
  }

  const { data, error } = await admin
    .from("closet_share_replies")
    .insert({
      share_id: shareId,
      author_name: authorName,
      message,
      suggested_item_ids: suggestedItemIds,
    })
    .select("id, author_name, message, suggested_item_ids, created_at")
    .single();

  if (error || !data) {
    return Response.json({ error: error?.message || "Couldn't save reply." }, { status: 500 });
  }

  return Response.json({ reply: data });
}
